"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { loadPendingInvites, type PendingInvite } from "@/lib/invites";

export type InviteState = { error?: string } | undefined;

/** The caller's pending invites, for pages that need to surface them. */
export async function listPendingInvites(): Promise<PendingInvite[]> {
  const supabase = await createClient();
  return loadPendingInvites(supabase);
}

/** Join the household. The function checks the invite is ours and unused. */
export async function acceptInvite(inviteId: string): Promise<InviteState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You are not signed in." };

  const { error } = await supabase.rpc("accept_household_invite", {
    p_invite_id: inviteId,
  });
  if (error) return { error: error.message };

  revalidatePath("/invite");
  revalidatePath("/dashboard");
  redirect("/dashboard");
}

/** Turn the invite down; it stays on record as revoked. */
export async function declineInvite(inviteId: string): Promise<InviteState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You are not signed in." };

  const { error } = await supabase.rpc("decline_household_invite", {
    p_invite_id: inviteId,
  });
  if (error) return { error: error.message };

  revalidatePath("/invite");
  return undefined;
}
