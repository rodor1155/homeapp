import { NextResponse } from "next/server";
import { loadHouseholdContext } from "@/lib/household";
import { lookupMot, MotLookupError } from "@/lib/mot";
import { consumeMotLookup } from "@/lib/mot-quota";
import { takeToken } from "@/lib/rate-limit";

// Calls DVSA's API, so it runs on Node and never on the edge cache.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* DVSA's trade API is quota'd per key, so this is throttled three ways before
   anything leaves the server: household members only (403 otherwise), a
   per-user burst limit in this isolate's memory, and durable per-user and
   app-wide daily caps counted in Postgres (lib/mot-quota.ts) that a cold start
   can't reset. Either limit answers 429. */

const MAX_BODY_BYTES = 2_000;
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60_000;

const TOO_MANY = "That’s enough lookups for now — try again in a minute.";
const DAILY_CAP = "That’s enough MOT lookups for today — try again tomorrow, or enter the date yourself.";

export async function POST(request: Request) {
  const { user, household } = await loadHouseholdContext();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  if (!household) {
    return NextResponse.json(
      { error: "Join or set up a household first." },
      { status: 403 }
    );
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

  if (
    !takeToken(`vehicle-mot:user:${user.id}`, {
      limit: RATE_LIMIT,
      windowMs: RATE_WINDOW_MS,
    })
  ) {
    return NextResponse.json({ error: TOO_MANY }, { status: 429 });
  }

  const quota = await consumeMotLookup(user.id);
  if (quota === "user_limit" || quota === "global_limit") {
    return NextResponse.json({ error: DAILY_CAP }, { status: 429 });
  }
  if (quota === "unavailable") {
    return NextResponse.json(
      { error: "The MOT lookup isn’t available right now. Try again later." },
      { status: 503 }
    );
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
