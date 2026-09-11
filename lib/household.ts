import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";

export type Locale = "UK" | "US";

export type Household = {
  id: string;
  name: string;
  locale: Locale | null;
};

export type Property = {
  id: string;
  address: string;
  type: string | null;
  year_built: number | null;
};

export type HouseholdContext = Awaited<ReturnType<typeof loadHouseholdContext>>;

/** The one row the membership query comes back with, household and all. */
type MembershipRow = {
  households: {
    id: string;
    name: string;
    locale: Locale | null;
    properties: (Property & { created_at: string })[] | null;
  } | null;
};

const MEMBERSHIP_SELECT =
  "households(id, name, locale, properties(id, address, type, year_built, created_at))";

/**
 * Loads the signed-in user together with their (first) household and property.
 * Returns nulls rather than redirecting so callers can decide what to do.
 *
 * Memoised for the length of a request, so a layout and the page inside it
 * share one load instead of each making the round trip.
 */
export const loadHouseholdContext = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { supabase, user: null, household: null, property: null };
  }

  // Membership, household and property in one round trip. RLS on the embedded
  // tables is the same member check the separate queries went through, so this
  // sees exactly what they did.
  const { data } = await supabase
    .from("household_members")
    .select(MEMBERSHIP_SELECT)
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const row = (data as MembershipRow | null) ?? null;
  const h = row?.households ?? null;

  const household: Household | null = h
    ? { id: h.id, name: h.name, locale: h.locale }
    : null;

  return { supabase, user, household, property: oldestProperty(h?.properties) };
});

// An embed two levels down can't be ordered in the query, so the oldest
// property is picked here — the same rule the query it replaced used.
function oldestProperty(
  properties: (Property & { created_at: string })[] | null | undefined
): Property | null {
  let oldest: (Property & { created_at: string }) | null = null;
  for (const p of properties ?? []) {
    if (!oldest || p.created_at < oldest.created_at) oldest = p;
  }
  if (!oldest) return null;
  return {
    id: oldest.id,
    address: oldest.address,
    type: oldest.type,
    year_built: oldest.year_built,
  };
}

export function isOnboarded(ctx: {
  household: Household | null;
  property: Property | null;
}): boolean {
  return Boolean(ctx.household?.locale && ctx.property);
}

/** For authenticated pages that also require a finished onboarding. */
export async function requireOnboarded() {
  const ctx = await loadHouseholdContext();
  if (!ctx.user) redirect("/sign-in");
  if (!ctx.household || !ctx.property || !ctx.household.locale) {
    redirect("/onboarding");
  }
  return {
    supabase: ctx.supabase,
    user: ctx.user,
    household: ctx.household,
    property: ctx.property,
  };
}
