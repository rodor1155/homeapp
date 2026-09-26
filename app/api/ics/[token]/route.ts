import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { isValidFeedToken } from "@/lib/ics-export";
import { buildIcsFeedForToken } from "@/lib/ics-feed-load";
import { takeToken } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000;

function normaliseToken(raw: string): string {
  return raw.endsWith(".ics") ? raw.slice(0, -4) : raw;
}

function notFound() {
  return new NextResponse("Not found", { status: 404 });
}

async function serveFeed(
  request: Request,
  token: string,
  headOnly: boolean
): Promise<NextResponse> {
  if (!isValidFeedToken(token)) return notFound();

  if (
    !takeToken(`ics-feed:${token}`, {
      limit: RATE_LIMIT,
      windowMs: RATE_WINDOW_MS,
    })
  ) {
    return new NextResponse("Too many requests", { status: 429 });
  }

  const admin = createAdminClient();
  const { data: feed } = await admin
    .from("household_calendar_feeds")
    .select("household_id")
    .eq("token", token)
    .maybeSingle();

  if (!feed?.household_id) return notFound();

  const { data: household } = await admin
    .from("households")
    .select("name")
    .eq("id", feed.household_id)
    .maybeSingle();

  const householdName = household?.name?.trim() || "Household";

  const body = await buildIcsFeedForToken(
    feed.household_id as string,
    householdName
  );
  const etag = `"${createHash("sha256").update(body).digest("hex")}"`;

  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch && ifNoneMatch === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: responseHeaders(etag, headOnly),
    });
  }

  if (headOnly) {
    return new NextResponse(null, {
      status: 200,
      headers: responseHeaders(etag, true),
    });
  }

  return new NextResponse(body, {
    status: 200,
    headers: responseHeaders(etag, false),
  });
}

function responseHeaders(etag: string, headOnly: boolean): HeadersInit {
  const headers: HeadersInit = {
    "Content-Type": "text/calendar; charset=utf-8",
    "Content-Disposition": 'inline; filename="hearth.ics"',
    "Cache-Control": "private, max-age=900, stale-while-revalidate=3600",
    "X-Robots-Tag": "noindex",
    ETag: etag,
  };
  if (headOnly) {
    headers["Content-Length"] = "0";
  }
  return headers;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> }
) {
  const { token: raw } = await context.params;
  return serveFeed(request, normaliseToken(raw), false);
}

export async function HEAD(
  request: Request,
  context: { params: Promise<{ token: string }> }
) {
  const { token: raw } = await context.params;
  return serveFeed(request, normaliseToken(raw), true);
}
