"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  loadInviteLinkPreview,
  loadPendingInviteLinks,
  type PendingInviteLink,
} from "@/lib/invite-links";
import { queryActiveMembership } from "@/lib/household";
import { publicAppOrigin } from "@/lib/public-app-origin";
import { createClient } from "@/lib/supabase-server";

export type InviteLinkState = { error?: string; ok?: boolean; url?: string } | undefined;

const MAX_PENDING_LINKS = 10;
const LINK_TTL_DAYS = 7;

function inviteUrl(token: string): string {
  return `${publicAppOrigin()}/join/${token}`;
}

async function resolveHousehold() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: membership } = await queryActiveMembership(
    supabase,
    user.id
  );
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

/** Pending link invites for the active household. */
export async function listInviteLinks(): Promise<PendingInviteLink[]> {
  const caller = await resolveHousehold();
  if (!caller.ok) return [];
  return loadPendingInviteLinks(caller.supabase, caller.householdId);
}

/** Create a single-use link invite (7-day expiry). Max 10 outstanding per household. */
export async function createInviteLink(): Promise<InviteLinkState> {
  const caller = await resolveHousehold();
  if (!caller.ok) return { error: caller.error };

  const now = new Date();
  const { count, error: countErr } = await caller.supabase
    .from("household_invites")
    .select("id", { count: "exact", head: true })
    .eq("household_id", caller.householdId)
    .eq("status", "pending")
    .not("token", "is", null)
    .gt("expires_at", now.toISOString());
  if (countErr) return { error: countErr.message };
  if ((count ?? 0) >= MAX_PENDING_LINKS) {
    return {
      error: `You already have ${MAX_PENDING_LINKS} active invite links. Revoke one before creating another.`,
    };
  }

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(
    now.getTime() + LINK_TTL_DAYS * 24 * 60 * 60 * 1000
  );

  const { error } = await caller.supabase.from("household_invites").insert({
    household_id: caller.householdId,
    invited_by: caller.userId,
    token,
    expires_at: expiresAt.toISOString(),
    status: "pending",
  });
  if (error) return { error: error.message };

  revalidatePath("/settings");
  revalidatePath("/family");
  return { ok: true, url: inviteUrl(token) };
}

/** Revoke a pending link invite. */
export async function revokeInviteLink(inviteId: string): Promise<InviteLinkState> {
  if (!inviteId) return { error: "Missing invitation." };

  const caller = await resolveHousehold();
  if (!caller.ok) return { error: caller.error };

  const { error } = await caller.supabase
    .from("household_invites")
    .update({ status: "revoked" })
    .eq("id", inviteId)
    .eq("household_id", caller.householdId)
    .eq("status", "pending")
    .not("token", "is", null);
  if (error) return { error: error.message };

  revalidatePath("/settings");
  revalidatePath("/family");
  return { ok: true };
}

/** Accept a link invite and land on the dashboard. */
export async function acceptInviteLink(token: string): Promise<InviteLinkState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You are not signed in." };

  const { error } = await supabase.rpc("accept_household_invite_link", {
    p_token: token,
  });
  if (error) {
    const preview = await loadInviteLinkPreview(supabase, token);
    if (preview?.already_member) {
      redirect("/dashboard");
    }
    return { error: error.message };
  }

  revalidatePath("/join");
  revalidatePath("/dashboard");
  revalidatePath("/family");
  revalidatePath("/settings");
  redirect("/dashboard");
}
