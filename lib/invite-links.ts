import type { SupabaseClient } from "@supabase/supabase-js";

/** A row of public.invite_link_preview(). Client-safe shape. */
export type InviteLinkPreview = {
  household_name: string;
  invited_by_name: string;
  expires_at: string | null;
  status: "valid" | "expired" | "used" | "revoked";
  already_member: boolean;
};

/** A pending link invite this household has created. */
export type PendingInviteLink = {
  id: string;
  created_at: string;
  expires_at: string;
  invited_by_name: string | null;
  expired: boolean;
};

const RECENTLY_EXPIRED_MS = 7 * 24 * 60 * 60 * 1000;

/** Preview a link invite by token. Returns null when the token is unknown. */
export async function loadInviteLinkPreview(
  supabase: SupabaseClient,
  token: string
): Promise<InviteLinkPreview | null> {
  const { data, error } = await supabase.rpc("invite_link_preview", {
    p_token: token,
  });
  if (error || !data?.length) return null;
  const row = data[0] as InviteLinkPreview;
  return row;
}

/**
 * Pending link invites for a household — still valid or expired within the
 * last seven days. Soft-fails to [] when the migration is not applied yet.
 */
export async function loadPendingInviteLinks(
  supabase: SupabaseClient,
  householdId: string
): Promise<PendingInviteLink[]> {
  const cutoff = new Date(Date.now() - RECENTLY_EXPIRED_MS).toISOString();
  const { data, error } = await supabase
    .from("household_invites")
    .select("id, created_at, expires_at, invited_by")
    .eq("household_id", householdId)
    .eq("status", "pending")
    .not("token", "is", null)
    .gte("expires_at", cutoff)
    .order("created_at", { ascending: false });
  if (error) return [];

  const rows = (data ?? []) as {
    id: string;
    created_at: string;
    expires_at: string;
    invited_by: string | null;
  }[];

  const inviterIds = [
    ...new Set(rows.map((r) => r.invited_by).filter(Boolean)),
  ] as string[];

  const names = new Map<string, string>();
  if (inviterIds.length > 0) {
    const { data: people } = await supabase
      .from("household_people")
      .select("user_id, name")
      .eq("household_id", householdId)
      .in("user_id", inviterIds);
    for (const p of people ?? []) {
      if (p.user_id) names.set(p.user_id, p.name as string);
    }
  }

  const now = Date.now();
  return rows.map((row) => ({
    id: row.id,
    created_at: row.created_at,
    expires_at: row.expires_at,
    invited_by_name: row.invited_by
      ? names.get(row.invited_by) ?? null
      : null,
    expired: new Date(row.expires_at).getTime() <= now,
  }));
}

/** Days until an ISO timestamp, floored at zero. */
export function daysUntilExpiry(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

/** Human label for a link invite's expiry. */
export function inviteLinkExpiryLabel(expiresAt: string): string {
  const days = daysUntilExpiry(expiresAt);
  if (days === 0) return "expires today";
  if (days === 1) return "expires tomorrow";
  return `expires in ${days} days`;
}

/** When a link was created — "today", "yesterday", or "3 days ago". */
export function inviteLinkCreatedLabel(createdAt: string): string {
  const ms = Date.now() - new Date(createdAt).getTime();
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

/** Secondary line for a pending invite row. */
export function inviteLinkMetaLabel(link: PendingInviteLink): string {
  const by = link.invited_by_name ?? "someone";
  const created = inviteLinkCreatedLabel(link.created_at);
  if (link.expired) {
    return `Created ${created} by ${by} · expired`;
  }
  return `Created ${created} by ${by} · ${inviteLinkExpiryLabel(link.expires_at)}`;
}
