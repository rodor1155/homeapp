import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runExtractionForDocument } from "@/lib/extraction";

export const runtime = "nodejs";
// Vision extraction on a multi-page PDF can take a while. Hobby caps at 60s;
// bump the plan for longer documents.
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const expected = process.env.EXTRACTION_WEBHOOK_SECRET;
  if (!expected) return false;

  const provided =
    request.headers.get("x-webhook-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const payload = body as {
    record?: { id?: string };
    document_id?: string;
    id?: string;
  };
  const documentId = payload.record?.id ?? payload.document_id ?? payload.id;

  if (!documentId || typeof documentId !== "string") {
    return NextResponse.json({ error: "missing document id" }, { status: 400 });
  }

  try {
    const result = await runExtractionForDocument(documentId);
    const status = result.status === "not_found" ? 404 : 200;
    return NextResponse.json({ ok: status === 200, ...result }, { status });
  } catch (error) {
    console.error("[extraction] unhandled failure", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "extraction failed",
      },
      { status: 500 }
    );
  }
}
