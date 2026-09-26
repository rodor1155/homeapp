import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import {
  createStripeClient,
  isBillingConfigured,
  loadSubscription,
  SUBSCRIPTION_SELECT,
  type SubscriptionRow,
} from "@/lib/billing";
import { createAdminClient } from "@/lib/supabase-admin";

/** Storage's own page size, and the most paths remove() is given at once. */
const STORAGE_PAGE = 1000;
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const GOOGLE_REVOKE_TIMEOUT_MS = 5000;

const TERMINAL_STRIPE_STATUSES = new Set(["canceled", "incomplete_expired"]);

type Bucket = ReturnType<SupabaseClient["storage"]["from"]>;
type StorageEntry = NonNullable<
  Awaited<ReturnType<Bucket["list"]>>["data"]
>[number];

type MembershipRow = {
  household_id: string;
  role: string;
  created_at: string;
};

type HouseholdRow = {
  id: string;
  name: string;
};

type MemberEmailRow = {
  user_id: string;
  email: string | null;
};

export class AccountDeletionError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable = true) {
    super(message);
    this.name = "AccountDeletionError";
    this.retryable = retryable;
  }
}

export type StripeDeletionResult = {
  householdId: string;
  subscriptionId: string | null;
  action:
    | "canceled"
    | "already_canceled"
    | "no_subscription"
    | "kept_for_shared_household";
  error?: string;
};

export type DeletionReport = {
  soleHouseholdsDeleted: string[];
  sharedHouseholdsLeft: string[];
  storageObjectsRemoved: number;
  stripe: StripeDeletionResult[];
  gmailRevoked: number;
};

export type AccountDeletionHouseholdPreview = {
  id: string;
  name: string;
  soleMember: boolean;
  otherMemberCount: number;
  userRole: string;
  cancelSubscription: boolean;
  nextOwnerLabel: string | null;
};

export type AccountDeletionPreview = {
  households: AccountDeletionHouseholdPreview[];
};

/** What deleting this account would do — computed server-side for the UI. */
export async function loadAccountDeletionPreview(
  userId: string
): Promise<AccountDeletionPreview> {
  const admin = createAdminClient();
  const memberships = await loadMemberships(admin, userId);
  if (memberships.length === 0) return { households: [] };

  const householdIds = memberships.map((row) => row.household_id);
  const { data: households, error } = await admin
    .from("households")
    .select("id, name")
    .in("id", householdIds);
  if (error) throw new Error(error.message);

  const householdById = new Map(
    ((households as HouseholdRow[] | null) ?? []).map((row) => [row.id, row])
  );

  const soleIds = await soleMemberHouseholdIds(admin, userId);
  const soleSet = new Set(soleIds);

  const previews: AccountDeletionHouseholdPreview[] = [];

  for (const membership of memberships) {
    const household = householdById.get(membership.household_id);
    if (!household) continue;

    const soleMember = soleSet.has(membership.household_id);
    const members = await loadHouseholdMemberRows(admin, membership.household_id);
    const otherMemberCount = members.filter((row) => row.user_id !== userId).length;

    let cancelSubscription = false;
    if (soleMember) {
      const subscription = await loadSubscription(membership.household_id);
      cancelSubscription = subscriptionNeedsCancellation(subscription);
    }

    let nextOwnerLabel: string | null = null;
    if (
      !soleMember &&
      membership.role === "owner" &&
      otherMemberCount > 0
    ) {
      nextOwnerLabel = await longestStandingMemberLabel(
        admin,
        membership.household_id,
        userId
      );
    }

    previews.push({
      id: household.id,
      name: household.name,
      soleMember,
      otherMemberCount,
      userRole: membership.role,
      cancelSubscription,
      nextOwnerLabel,
    });
  }

  return { households: previews };
}

/** Deletes a user and everything that dies with them. Throws on abort. */
export async function deleteAccountForUser(
  userId: string
): Promise<DeletionReport> {
  const admin = createAdminClient();

  const memberships = await loadMemberships(admin, userId);
  const soleIds = await soleMemberHouseholdIds(admin, userId);
  const soleSet = new Set(soleIds);
  const sharedIds = memberships
    .map((row) => row.household_id)
    .filter((id) => !soleSet.has(id));

  const stripe: StripeDeletionResult[] = [];
  for (const householdId of soleIds) {
    stripe.push(await cancelHouseholdSubscription(admin, householdId));
  }
  for (const householdId of sharedIds) {
    const subscription = await loadSubscription(householdId);
    if (subscription?.stripe_subscription_id) {
      stripe.push({
        householdId,
        subscriptionId: subscription.stripe_subscription_id,
        action: "kept_for_shared_household",
      });
    }
  }

  const gmailRevoked = await revokeAndDeleteGmailConnections(admin, userId);

  const bucket = admin.storage.from("documents");
  let storageObjectsRemoved = 0;
  for (const householdId of soleIds) {
    storageObjectsRemoved += await removeHouseholdFiles(bucket, householdId);
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) {
    throw new AccountDeletionError(deleteError.message);
  }

  const { count: remainingMemberships } = await admin
    .from("household_members")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);
  if ((remainingMemberships ?? 0) > 0) {
    throw new AccountDeletionError(
      "Account deletion did not complete. Please try again.",
      true
    );
  }

  for (const householdId of soleIds) {
    const { data: household } = await admin
      .from("households")
      .select("id")
      .eq("id", householdId)
      .maybeSingle();
    if (household) {
      throw new AccountDeletionError(
        "Account deletion did not complete. Please try again.",
        true
      );
    }

    const remaining = await countStorageObjects(bucket, householdId);
    if (remaining > 0) {
      console.warn(
        `[account-deletion] ${remaining} storage object(s) remain under ${householdId}/ after user delete`
      );
    }
  }

  return {
    soleHouseholdsDeleted: soleIds,
    sharedHouseholdsLeft: sharedIds,
    storageObjectsRemoved,
    stripe,
    gmailRevoked,
  };
}

async function loadMemberships(
  admin: SupabaseClient,
  userId: string
): Promise<MembershipRow[]> {
  const { data, error } = await admin
    .from("household_members")
    .select("household_id, role, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw new AccountDeletionError(error.message);
  return (data as MembershipRow[]) ?? [];
}

async function soleMemberHouseholdIds(
  admin: SupabaseClient,
  userId: string
): Promise<string[]> {
  const memberships = await loadMemberships(admin, userId);
  const ids = memberships.map((row) => row.household_id);
  if (ids.length === 0) return [];

  const { data: others, error } = await admin
    .from("household_members")
    .select("household_id")
    .in("household_id", ids)
    .neq("user_id", userId);
  if (error) throw new AccountDeletionError(error.message);

  const shared = new Set(
    (others ?? []).map((row) => row.household_id as string)
  );
  return ids.filter((id) => !shared.has(id));
}

async function loadHouseholdMemberRows(
  admin: SupabaseClient,
  householdId: string
): Promise<Array<{ user_id: string; role: string; created_at: string }>> {
  const { data, error } = await admin
    .from("household_members")
    .select("user_id, role, created_at")
    .eq("household_id", householdId)
    .order("created_at", { ascending: true });
  if (error) throw new AccountDeletionError(error.message);
  return (data as Array<{ user_id: string; role: string; created_at: string }>) ?? [];
}

async function longestStandingMemberLabel(
  admin: SupabaseClient,
  householdId: string,
  excludeUserId: string
): Promise<string | null> {
  const members = await loadHouseholdMemberRows(admin, householdId);
  const next = members.find((row) => row.user_id !== excludeUserId);
  if (!next) return null;

  const { data: emails } = await admin.rpc("household_member_emails", {
    p_household_id: householdId,
  });
  const email =
    ((emails as MemberEmailRow[] | null) ?? []).find(
      (row) => row.user_id === next.user_id
    )?.email ?? null;

  const { data: person } = await admin
    .from("household_people")
    .select("name")
    .eq("household_id", householdId)
    .eq("user_id", next.user_id)
    .maybeSingle();

  if (person?.name) return person.name as string;
  if (email) return emailLocalPart(email);
  return "another member";
}

function emailLocalPart(email: string): string {
  const at = email.indexOf("@");
  return at === -1 ? email : email.slice(0, at);
}

function subscriptionNeedsCancellation(
  subscription: SubscriptionRow | null
): boolean {
  if (!subscription?.stripe_subscription_id) return false;
  return !TERMINAL_STRIPE_STATUSES.has(subscription.status);
}

async function cancelHouseholdSubscription(
  admin: SupabaseClient,
  householdId: string
): Promise<StripeDeletionResult> {
  const { data, error } = await admin
    .from("subscriptions")
    .select(SUBSCRIPTION_SELECT)
    .eq("household_id", householdId)
    .maybeSingle();
  if (error) throw new AccountDeletionError(error.message);

  const subscription = (data as SubscriptionRow | null) ?? null;
  const subscriptionId = subscription?.stripe_subscription_id ?? null;

  if (!subscription || !subscriptionId) {
    return {
      householdId,
      subscriptionId,
      action: "no_subscription",
    };
  }

  if (TERMINAL_STRIPE_STATUSES.has(subscription.status)) {
    return {
      householdId,
      subscriptionId,
      action: "already_canceled",
    };
  }

  if (!isBillingConfigured()) {
    console.error(
      `[account-deletion] active subscription ${subscriptionId} for household ${householdId} but billing is not configured`
    );
    throw new AccountDeletionError(
      "We could not cancel your subscription automatically. Please contact support before deleting your account.",
      false
    );
  }

  const stripe = createStripeClient();
  try {
    await stripe.subscriptions.cancel(subscriptionId);
    return { householdId, subscriptionId, action: "canceled" };
  } catch (e) {
    if (isStripeMissingResource(e)) {
      return { householdId, subscriptionId, action: "already_canceled" };
    }
    const message =
      e instanceof Error ? e.message : "Could not cancel your subscription.";
    throw new AccountDeletionError(
      `${message} Please try again in a moment.`,
      true
    );
  }
}

function isStripeMissingResource(error: unknown): boolean {
  if (error instanceof Stripe.errors.StripeError) {
    return error.code === "resource_missing";
  }
  return false;
}

async function revokeAndDeleteGmailConnections(
  admin: SupabaseClient,
  userId: string
): Promise<number> {
  const { data, error } = await admin
    .from("gmail_connections")
    .select("id, refresh_token, access_token")
    .eq("user_id", userId);
  if (error) throw new AccountDeletionError(error.message);

  const rows =
    (data as Array<{
      id: string;
      refresh_token: string;
      access_token: string;
    }> | null) ?? [];

  let revoked = 0;
  for (const row of rows) {
    const token = row.refresh_token || row.access_token;
    if (token && (await revokeGoogleToken(token))) revoked += 1;
    const { error: deleteError } = await admin
      .from("gmail_connections")
      .delete()
      .eq("id", row.id);
    if (deleteError) throw new AccountDeletionError(deleteError.message);
  }

  return revoked;
}

async function revokeGoogleToken(token: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      GOOGLE_REVOKE_TIMEOUT_MS
    );
    const response = await fetch(GOOGLE_REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `token=${encodeURIComponent(token)}`,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Every object under a household prefix. Recurses to any depth and paginates
 * each folder listing.
 */
async function removeHouseholdFiles(
  bucket: Bucket,
  householdId: string
): Promise<number> {
  const paths = await collectStoragePaths(bucket, householdId);

  for (let i = 0; i < paths.length; i += STORAGE_PAGE) {
    const batch = paths.slice(i, i + STORAGE_PAGE);
    if (batch.length === 0) continue;
    const { error } = await bucket.remove(batch);
    if (error) {
      throw new AccountDeletionError(
        "We could not remove your files. Please try again in a moment.",
        true
      );
    }
  }

  const remaining = await countStorageObjects(bucket, householdId);
  if (remaining > 0) {
    throw new AccountDeletionError(
      "We could not remove all of your files. Please try again in a moment.",
      true
    );
  }

  return paths.length;
}

async function collectStoragePaths(
  bucket: Bucket,
  prefix: string
): Promise<string[]> {
  const paths: string[] = [];

  for (const entry of await listAll(bucket, prefix)) {
    const entryPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.id !== null) {
      paths.push(entryPath);
      continue;
    }
    paths.push(...(await collectStoragePaths(bucket, entryPath)));
  }

  return paths;
}

async function countStorageObjects(
  bucket: Bucket,
  householdId: string
): Promise<number> {
  return (await collectStoragePaths(bucket, householdId)).length;
}

async function listAll(
  bucket: Bucket,
  prefix: string
): Promise<StorageEntry[]> {
  const entries: StorageEntry[] = [];

  for (let offset = 0; ; offset += STORAGE_PAGE) {
    const { data, error } = await bucket.list(prefix, {
      limit: STORAGE_PAGE,
      offset,
    });
    if (error) throw new AccountDeletionError(error.message);
    const page = data ?? [];
    entries.push(...page);
    if (page.length < STORAGE_PAGE) return entries;
  }
}
