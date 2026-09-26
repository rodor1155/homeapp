"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { queryActiveMembership } from "@/lib/household";
import { createClient } from "@/lib/supabase-server";

export type KidLinkState = { error?: string; ok?: boolean } | undefined;

function newKidLinkToken(): string {
  return randomBytes(32).toString("base64url");
}

function refresh() {
  revalidatePath("/family");
}

async function resolveHousehold() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: membership } = await queryActiveMembership(supabase, user.id);
  if (!membership) {
    return { ok: false as const, error: "No household found for your account." };
  }

  return {
    ok: true as const,
    supabase,
    userId: user.id,
    householdId: membership.household_id as string,
  };
}

/** Create a kid-view link for a child in the active household. */
export async function createKidLink(personId: string): Promise<KidLinkState> {
  const caller = await resolveHousehold();
  if (!caller.ok) return { error: caller.error };

  const { data: existing } = await caller.supabase
    .from("person_kid_links")
    .select("token")
    .eq("person_id", personId)
    .eq("household_id", caller.householdId)
    .maybeSingle();

  if (existing?.token) {
    return { ok: true };
  }

  const token = newKidLinkToken();
  const { error } = await caller.supabase.from("person_kid_links").insert({
    person_id: personId,
    household_id: caller.householdId,
    token,
    created_by: caller.userId,
  });

  if (error) {
    console.error("[kid-links] create", error.message);
    return { error: "We couldn’t create the kid view link just now." };
  }

  refresh();
  return { ok: true };
}

/** Replace the token — the old URL 404s. */
export async function regenerateKidLink(personId: string): Promise<KidLinkState> {
  const caller = await resolveHousehold();
  if (!caller.ok) return { error: caller.error };

  const token = newKidLinkToken();
  const { data, error } = await caller.supabase
    .from("person_kid_links")
    .update({ token, rotated_at: new Date().toISOString() })
    .eq("person_id", personId)
    .eq("household_id", caller.householdId)
    .select("person_id")
    .maybeSingle();

  if (error) {
    console.error("[kid-links] regenerate", error.message);
    return { error: "We couldn’t regenerate the link just now." };
  }
  if (!data) {
    return { error: "There isn’t a kid view link to regenerate yet." };
  }

  refresh();
  return { ok: true };
}

/** Delete the link — the URL 404s. */
export async function revokeKidLink(personId: string): Promise<KidLinkState> {
  const caller = await resolveHousehold();
  if (!caller.ok) return { error: caller.error };

  const { error } = await caller.supabase
    .from("person_kid_links")
    .delete()
    .eq("person_id", personId)
    .eq("household_id", caller.householdId);

  if (error) {
    console.error("[kid-links] revoke", error.message);
    return { error: "We couldn’t turn off the kid view link just now." };
  }

  refresh();
  return { ok: true };
}
