import { NextResponse } from "next/server";
import { lookupMot, MotLookupError } from "@/lib/mot";
import { createClient } from "@/lib/supabase-server";

// Calls DVSA's API, so it runs on Node and never on the edge cache.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 2_000;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const text = await request.text();
  if (text.length === 0 || text.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Send a registration." }, { status: 400 });
  }

  let registration: unknown;
  try {
    registration = (JSON.parse(text) as { registration?: unknown }).registration;
  } catch {
    return NextResponse.json({ error: "Send a registration." }, { status: 400 });
  }

  if (typeof registration !== "string" || !registration.trim()) {
    return NextResponse.json({ error: "Send a registration." }, { status: 400 });
  }

  try {
    const result = await lookupMot(registration);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof MotLookupError) {
      console.error("[vehicle/mot]", error.message);
    } else {
      console.error("[vehicle/mot] unexpected error", error);
    }
    return NextResponse.json(
      { error: "The MOT lookup didn’t answer. Try again in a moment." },
      { status: 502 }
    );
  }
}
