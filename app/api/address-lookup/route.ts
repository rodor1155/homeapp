import { NextResponse } from "next/server";
import { lookupAddresses } from "@/lib/address-lookup";
import { createClient } from "@/lib/supabase-server";

// Fetches a third-party API, so it runs on Node and never on the cache.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* The address picker's one endpoint: a postcode in, the addresses at it out.
   Signed-in only — the Ideal Postcodes key is metered, so this is not something
   to leave open, and a household has no reason to reach it before they are
   in. Everything about *which* provider answered is decided server-side in
   lib/address-lookup.ts; the client only reads the result. */

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const postcode = new URL(request.url).searchParams.get("postcode") ?? "";
  if (!postcode.trim()) {
    return NextResponse.json({ error: "Enter a postcode." }, { status: 400 });
  }

  const result = await lookupAddresses(postcode);
  // A bad postcode is the household's typo, not a server fault, so it comes
  // back as a 200 with an `error` the picker prints under the field.
  return NextResponse.json(result);
}
