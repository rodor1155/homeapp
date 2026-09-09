import type { SupabaseClient } from "@supabase/supabase-js";

/** A row of public.pending_invites_for_me(). Client-safe shape. */
export type PendingInvite = {
  invite_id: string;
  household_id: string;
  household_name: string;
  invited_by_email: string | null;
  created_at: string;
};

/**
 * The caller's own pending invites. household_invites is only readable by
 * existing members, so this has to go through the SECURITY DEFINER function.
 * Reading invites is never the point of a page, so a failure (including the
 * function not being deployed yet) is treated as "none".
 */
export async function loadPendingInvites(
  supabase: SupabaseClient
): Promise<PendingInvite[]> {
  const { data, error } = await supabase.rpc("pending_invites_for_me");
  if (error) return [];
  return (data as PendingInvite[] | null) ?? [];
}
