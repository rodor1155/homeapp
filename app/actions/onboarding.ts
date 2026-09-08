"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";

export type OnboardingState = { error?: string } | undefined;

export type OnboardingInput = {
  locale: string;
  address: string;
  type: string;
  yearBuilt: string;
  partnerEmail: string;
};

export async function completeOnboarding(
  _prev: OnboardingState,
  input: OnboardingInput
): Promise<OnboardingState> {
  const locale = input.locale;
  const address = input.address.trim();
  const type = input.type.trim() || null;
  const yearRaw = input.yearBuilt.trim();
  const partnerEmail = input.partnerEmail.trim().toLowerCase() || null;

  if (locale !== "UK" && locale !== "US") {
    return { error: "Choose UK or US." };
  }
  if (!address) {
    return { error: "Enter your property address." };
  }

  let year_built: number | null = null;
  if (yearRaw) {
    const parsed = Number(yearRaw);
    if (!Number.isInteger(parsed) || parsed < 1000 || parsed > 2100) {
      return { error: "Enter a valid year built, or leave it blank." };
    }
    year_built = parsed;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: membership } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!membership) {
    return { error: "No household found for your account." };
  }
  const householdId = membership.household_id as string;

  const { error: hErr } = await supabase
    .from("households")
    .update({ locale })
    .eq("id", householdId);
  if (hErr) return { error: hErr.message };

  const { data: existing } = await supabase
    .from("properties")
    .select("id")
    .eq("household_id", householdId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existing) {
    const { error: pErr } = await supabase
      .from("properties")
      .update({ address, type, year_built })
      .eq("id", existing.id);
    if (pErr) return { error: pErr.message };
  } else {
    const { error: pErr } = await supabase
      .from("properties")
      .insert({ household_id: householdId, address, type, year_built });
    if (pErr) return { error: pErr.message };
  }

  if (partnerEmail && partnerEmail !== user.email?.toLowerCase()) {
    // Best effort: a failed invite record shouldn't block onboarding.
    await supabase.from("household_invites").insert({
      household_id: householdId,
      email: partnerEmail,
      invited_by: user.id,
    });
  }

  redirect("/dashboard");
}
