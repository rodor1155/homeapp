"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";
import type { MemberEmail } from "@/lib/members";

export type SettingsState = { error?: string; ok?: boolean } | undefined;

export type HouseholdInput = {
  name: string;
  locale: string;
  address: string;
  type: string;
  yearBuilt: string;
};

type Caller =
  | { ok: false; error: string }
  | { ok: true; userId: string; email: string | null; householdId: string };

/**
 * The signed-in user and the household every write here is scoped to. RLS is
 * what actually enforces the scope; this just picks the household the rest of
 * the app assumes — the oldest membership.
 */
async function resolveCaller(supabase: SupabaseClient): Promise<Caller> {
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
    return { ok: false, error: "No household found for your account." };
  }

  return {
    ok: true,
    userId: user.id,
    email: user.email ?? null,
    householdId: membership.household_id as string,
  };
}

/** Rename the household and save the property details behind it. */
export async function updateHousehold(
  _prev: SettingsState,
  input: HouseholdInput
): Promise<SettingsState> {
  const name = input.name.trim();
  const locale = input.locale;
  const address = input.address.trim();
  const type = input.type.trim() || null;
  const yearRaw = input.yearBuilt.trim();

  if (!name) {
    return { error: "Give your household a name." };
  }
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
  const caller = await resolveCaller(supabase);
  if (!caller.ok) return { error: caller.error };

  const { error: hErr } = await supabase
    .from("households")
    .update({ name, locale })
    .eq("id", caller.householdId);
  if (hErr) return { error: hErr.message };

  const { data: existing } = await supabase
    .from("properties")
    .select("id")
    .eq("household_id", caller.householdId)
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
      .insert({ household_id: caller.householdId, address, type, year_built });
    if (pErr) return { error: pErr.message };
  }

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/documents");
  return { ok: true };
}

/** Note an invitation for someone else. Same rule onboarding uses. */
export async function inviteMember(
  _prev: SettingsState,
  formData: FormData
): Promise<SettingsState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!email) {
    return { error: "Enter an email address." };
  }
  if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) {
    return { error: "That does not look like an email address." };
  }

  const supabase = await createClient();
  const caller = await resolveCaller(supabase);
  if (!caller.ok) return { error: caller.error };

  if (email === caller.email?.toLowerCase()) {
    return { error: "That is your own address — you are already here." };
  }

  const { data: emails } = await supabase.rpc("household_member_emails", {
    p_household_id: caller.householdId,
  });
  const members = (emails as MemberEmail[] | null) ?? [];
  if (members.some((row) => row.email?.toLowerCase() === email)) {
    return { error: "They are already in your household." };
  }

  const { data: outstanding } = await supabase
    .from("household_invites")
    .select("id")
    .eq("household_id", caller.householdId)
    .eq("status", "pending")
    .ilike("email", email)
    .limit(1)
    .maybeSingle();
  if (outstanding) {
    return { error: "There is already an invitation waiting at that address." };
  }

  const { error } = await supabase.from("household_invites").insert({
    household_id: caller.householdId,
    email,
    invited_by: caller.userId,
  });
  if (error) return { error: error.message };

  revalidatePath("/settings");
  return { ok: true };
}

/** Withdraw an invitation nobody has accepted yet. */
export async function revokeInvite(
  _prev: SettingsState,
  formData: FormData
): Promise<SettingsState> {
  const inviteId = String(formData.get("invite_id") ?? "");
  if (!inviteId) return { error: "Missing invitation." };

  const supabase = await createClient();
  const caller = await resolveCaller(supabase);
  if (!caller.ok) return { error: caller.error };

  const { error } = await supabase
    .from("household_invites")
    .update({ status: "revoked" })
    .eq("id", inviteId)
    .eq("household_id", caller.householdId)
    .eq("status", "pending");
  if (error) return { error: error.message };

  revalidatePath("/settings");
  return { ok: true };
}
