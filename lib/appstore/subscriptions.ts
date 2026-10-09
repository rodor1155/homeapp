import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  accessEndsAt,
  eventTime,
  isAppStoreRowEntitled,
  isStaleEvent,
  rowFromEvent,
  type AppStoreSubscriptionRow,
  type SubscriptionEvent,
} from "@/lib/appstore/entitlement";
import { createAdminClient } from "@/lib/supabase-admin";

/* Reads and writes of `app_store_subscriptions`. Service role only: callers
   have already verified Apple's signature (writes) or resolved the household
   for the signed-in user (reads). */

const SELECT =
  "original_transaction_id, household_id, product_id, environment, status, expires_at, grace_period_expires_at, revoked_at, auto_renew, last_transaction_id, app_account_token, last_notification_type, last_notification_subtype, last_event_at, submitted_by";

export async function findAppStoreSubscription(
  admin: SupabaseClient,
  originalTransactionId: string
): Promise<AppStoreSubscriptionRow | null> {
  const { data, error } = await admin
    .from("app_store_subscriptions")
    .select(SELECT)
    .eq("original_transaction_id", originalTransactionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as AppStoreSubscriptionRow | null) ?? null;
}

export async function householdExists(
  admin: SupabaseClient,
  householdId: string
): Promise<boolean> {
  const { data, error } = await admin
    .from("households")
    .select("id")
    .eq("id", householdId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

export type ApplyResult = {
  row: AppStoreSubscriptionRow;
  /** False when the event was older than what is already stored. */
  applied: boolean;
};

/** Writes what Apple told us about one subscription. Throws on a DB error. */
export async function applySubscriptionEvent(
  admin: SupabaseClient,
  event: SubscriptionEvent,
  householdId: string,
  existing: AppStoreSubscriptionRow | null,
  submittedBy: string | null = null
): Promise<ApplyResult> {
  const eventMs = eventTime(
    event.transaction,
    event.renewal,
    event.notificationSignedDate
  );
  if (existing && isStaleEvent(existing, eventMs)) {
    return { row: existing, applied: false };
  }

  const row: AppStoreSubscriptionRow = {
    ...rowFromEvent(event, householdId, existing),
    submitted_by: submittedBy ?? existing?.submitted_by ?? null,
  };
  const { error } = await admin
    .from("app_store_subscriptions")
    .upsert(
      { ...row, updated_at: new Date().toISOString() },
      { onConflict: "original_transaction_id" }
    );
  if (error) throw new Error(error.message);
  return { row, applied: true };
}

/**
 * The household's App Store subscription that is paying right now, if any —
 * the one whose access runs longest. A read failure (including the table not
 * existing yet) reads as "none" rather than breaking the page.
 */
export async function loadActiveAppStoreSubscription(
  householdId: string
): Promise<AppStoreSubscriptionRow | null> {
  let rows: AppStoreSubscriptionRow[] = [];
  try {
    const { data, error } = await createAdminClient()
      .from("app_store_subscriptions")
      .select(SELECT)
      .eq("household_id", householdId);
    if (error) {
      console.warn("[appstore] could not read subscriptions", error.message);
      return null;
    }
    rows = (data as AppStoreSubscriptionRow[] | null) ?? [];
  } catch (error) {
    console.warn(
      "[appstore] could not read subscriptions",
      error instanceof Error ? error.message : error
    );
    return null;
  }

  const now = new Date();
  return (
    rows
      .filter((row) => isAppStoreRowEntitled(row, now))
      .sort((a, b) => (accessEndsAt(b) ?? 0) - (accessEndsAt(a) ?? 0))[0] ??
    null
  );
}
