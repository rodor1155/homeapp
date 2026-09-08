import "server-only";

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

/**
 * Loads the signed-in user together with their (first) household and property.
 * Returns nulls rather than redirecting so callers can decide what to do.
 */
export async function loadHouseholdContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { supabase, user: null, household: null, property: null };
  }

  const { data: membership } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  let household: Household | null = null;
  let property: Property | null = null;

  if (membership) {
    const { data: h } = await supabase
      .from("households")
      .select("id, name, locale")
      .eq("id", membership.household_id)
      .maybeSingle();
    household = (h as Household | null) ?? null;

    if (household) {
      const { data: p } = await supabase
        .from("properties")
        .select("id, address, type, year_built")
        .eq("household_id", household.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      property = (p as Property | null) ?? null;
    }
  }

  return { supabase, user, household, property };
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
