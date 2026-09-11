import { NextResponse } from "next/server";
import { lookupAddresses, normalisePostcode } from "@/lib/address-lookup";
import { cacheGet, cacheSet, takeToken } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase-server";
import type { AddressLookupResult } from "@/lib/address-lookup";

// Fetches a third-party API, so it runs on Node and never on the cache.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* The address picker's one endpoint: a postcode in, the addresses at it out.
   Signed-in only — the Ideal Postcodes key is metered, so this is not something
   to leave open, and a household has no reason to reach it before they are
   in. Per-user throttle + a short cache on the normalised postcode keep the
   key budget under control. Everything about *which* provider answered is
   decided server-side in lib/address-lookup.ts; the client only reads the
   result. */

const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;
const CACHE_TTL_MS = 10 * 60 * 1000;

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const postcodeRaw = new URL(request.url).searchParams.get("postcode") ?? "";
  if (!postcodeRaw.trim()) {
    return NextResponse.json({ error: "Enter a postcode." }, { status: 400 });
  }

  const normalised = normalisePostcode(postcodeRaw) ?? postcodeRaw.trim().toUpperCase();
  const cacheKey = `address-lookup:${normalised}`;
  const cached = cacheGet<AddressLookupResult>(cacheKey);
  if (cached) {
    return NextResponse.json(cached);
  }

  if (
    !takeToken(`address-lookup:user:${user.id}`, {
      limit: RATE_LIMIT,
      windowMs: RATE_WINDOW_MS,
    })
  ) {
    return NextResponse.json(
      { error: "That’s enough lookups for now — try again in a minute." },
      { status: 429 }
    );
  }

  const result = await lookupAddresses(postcodeRaw);
  // Cache hits and real answers; skip caching pure validation typos so a
  // corrected digit isn't stuck behind a bad response.
  if (!("error" in result) || result.error !== "That doesn’t look like a UK postcode.") {
    cacheSet(cacheKey, result, CACHE_TTL_MS);
  }
  // A bad postcode is the household's typo, not a server fault, so it comes
  // back as a 200 with an `error` the picker prints under the field.
  return NextResponse.json(result);
}
