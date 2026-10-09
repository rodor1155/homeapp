import type {
  JWSRenewalInfoDecodedPayload,
  JWSTransactionDecodedPayload,
} from "@apple/app-store-server-library";
import type { AppStoreEnvironment } from "@/lib/appstore/verify";

/* Pure rules for turning verified App Store data into a household's plan.
   No I/O in here, so the rules can be tested on their own. */

export type AppStoreSubscriptionRow = {
  original_transaction_id: string;
  household_id: string;
  product_id: string;
  environment: AppStoreEnvironment;
  status: string;
  expires_at: string | null;
  grace_period_expires_at: string | null;
  revoked_at: string | null;
  auto_renew: boolean | null;
  last_transaction_id: string | null;
  app_account_token: string | null;
  last_notification_type: string | null;
  last_notification_subtype: string | null;
  last_event_at: string | null;
  submitted_by: string | null;
};

export type AppStoreStatus =
  | "active"
  | "grace_period"
  | "billing_retry"
  | "expired"
  | "revoked";

type EntitlementDates = Pick<
  AppStoreSubscriptionRow,
  "expires_at" | "grace_period_expires_at" | "revoked_at"
>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Apple's appAccountToken when it is a UUID (we set it to the household id). */
export function accountTokenOf(
  transaction: Pick<JWSTransactionDecodedPayload, "appAccountToken">
): string | null {
  const token = transaction.appAccountToken?.trim();
  return token && UUID.test(token) ? token.toLowerCase() : null;
}

function iso(ms: number | undefined | null): string | null {
  return typeof ms === "number" && Number.isFinite(ms) && ms > 0
    ? new Date(ms).toISOString()
    : null;
}

function time(value: string | null): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

/** When access ends: the later of expiry and any billing grace period. */
export function accessEndsAt(row: EntitlementDates): number | null {
  const expires = time(row.expires_at);
  const grace = time(row.grace_period_expires_at);
  if (expires === null) return grace;
  return grace !== null && grace > expires ? grace : expires;
}

/**
 * Whether this subscription pays for the household right now. Decided from
 * the dates Apple signed, at read time: revoked (refunded) ends it at once,
 * otherwise it lasts to the end of the paid period or the grace period.
 */
export function isAppStoreRowEntitled(
  row: EntitlementDates,
  now: Date = new Date()
): boolean {
  if (row.revoked_at) return false;
  const ends = accessEndsAt(row);
  return ends !== null && ends > now.getTime();
}

export function statusOf(
  row: EntitlementDates,
  inBillingRetry: boolean,
  now: Date = new Date()
): AppStoreStatus {
  if (row.revoked_at) return "revoked";
  const expires = time(row.expires_at);
  if (expires !== null && expires > now.getTime()) return "active";
  const grace = time(row.grace_period_expires_at);
  if (grace !== null && grace > now.getTime()) return "grace_period";
  return inBillingRetry ? "billing_retry" : "expired";
}

/** Auto-renewable subscriptions for one of our products, and nothing else. */
export function isHouseholdSubscription(
  transaction: Pick<JWSTransactionDecodedPayload, "productId" | "type">,
  productIds: readonly string[]
): boolean {
  return (
    transaction.type === "Auto-Renewable Subscription" &&
    typeof transaction.productId === "string" &&
    productIds.includes(transaction.productId)
  );
}

/** Apple's signedDate on the newest piece of this event. */
export function eventTime(
  transaction: Pick<JWSTransactionDecodedPayload, "signedDate">,
  renewal?: Pick<JWSRenewalInfoDecodedPayload, "signedDate"> | null,
  notificationSignedDate?: number
): number {
  return Math.max(
    transaction.signedDate ?? 0,
    renewal?.signedDate ?? 0,
    notificationSignedDate ?? 0
  );
}

/** True when an event is older than what the row already reflects. */
export function isStaleEvent(
  existing: Pick<AppStoreSubscriptionRow, "last_event_at"> | null,
  eventMs: number
): boolean {
  const last = time(existing?.last_event_at ?? null);
  return last !== null && eventMs > 0 && eventMs < last;
}

export type SubscriptionEvent = {
  transaction: JWSTransactionDecodedPayload;
  renewal?: JWSRenewalInfoDecodedPayload | null;
  environment: AppStoreEnvironment;
  notificationType?: string | null;
  notificationSubtype?: string | null;
  notificationSignedDate?: number;
};

/**
 * The row an event produces. Renewal details (auto-renew, grace period) only
 * come with notifications; a transaction on its own leaves what is already
 * stored for those untouched.
 */
export function rowFromEvent(
  event: SubscriptionEvent,
  householdId: string,
  existing: AppStoreSubscriptionRow | null,
  now: Date = new Date()
): Omit<AppStoreSubscriptionRow, "submitted_by"> {
  const { transaction, renewal } = event;
  const dates: EntitlementDates = {
    expires_at: iso(transaction.expiresDate),
    revoked_at: iso(transaction.revocationDate),
    grace_period_expires_at: renewal
      ? iso(renewal.gracePeriodExpiresDate)
      : (existing?.grace_period_expires_at ?? null),
  };
  const eventMs = eventTime(transaction, renewal, event.notificationSignedDate);

  return {
    original_transaction_id: String(transaction.originalTransactionId),
    household_id: householdId,
    product_id: String(transaction.productId),
    environment: event.environment,
    status: statusOf(dates, renewal?.isInBillingRetryPeriod === true, now),
    ...dates,
    auto_renew: renewal
      ? renewal.autoRenewStatus === 1
      : (existing?.auto_renew ?? null),
    last_transaction_id: transaction.transactionId ?? null,
    app_account_token:
      accountTokenOf(transaction) ?? existing?.app_account_token ?? null,
    last_notification_type:
      event.notificationType ?? existing?.last_notification_type ?? null,
    last_notification_subtype: event.notificationType
      ? (event.notificationSubtype ?? null)
      : (existing?.last_notification_subtype ?? null),
    last_event_at: eventMs > 0 ? new Date(eventMs).toISOString() : null,
  };
}
