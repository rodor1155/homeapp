import { afterEach, describe, expect, it, vi } from "vitest";
import {
  accountTokenOf,
  isAppStoreRowEntitled,
  isHouseholdSubscription,
  isStaleEvent,
  rowFromEvent,
  statusOf,
} from "@/lib/appstore/entitlement";
import { DEFAULT_PRODUCT_IDS } from "@/lib/appstore/config";
import { isReviewDemoEmail } from "@/lib/review-demo";
import { HOUSEHOLD_ID, MONTHLY, transactionPayload } from "./fixtures";

const NOW = new Date("2026-10-09T12:00:00Z");
const day = 24 * 3600 * 1000;
const at = (offsetDays: number) => new Date(NOW.getTime() + offsetDays * day).toISOString();

describe("App Store entitlement rules", () => {
  it("is entitled until the paid period ends", () => {
    const row = { expires_at: at(3), grace_period_expires_at: null, revoked_at: null };
    expect(isAppStoreRowEntitled(row, NOW)).toBe(true);
    expect(statusOf(row, false, NOW)).toBe("active");
  });

  it("lapses on its own once the period has passed", () => {
    const row = { expires_at: at(-1), grace_period_expires_at: null, revoked_at: null };
    expect(isAppStoreRowEntitled(row, NOW)).toBe(false);
    expect(statusOf(row, false, NOW)).toBe("expired");
    expect(statusOf(row, true, NOW)).toBe("billing_retry");
  });

  it("keeps access through Apple's billing grace period", () => {
    const row = { expires_at: at(-1), grace_period_expires_at: at(5), revoked_at: null };
    expect(isAppStoreRowEntitled(row, NOW)).toBe(true);
    expect(statusOf(row, true, NOW)).toBe("grace_period");
  });

  it("ends at once on a refund or revocation", () => {
    const row = { expires_at: at(20), grace_period_expires_at: null, revoked_at: at(-1) };
    expect(isAppStoreRowEntitled(row, NOW)).toBe(false);
    expect(statusOf(row, false, NOW)).toBe("revoked");
  });

  it("is not entitled without an expiry date", () => {
    expect(
      isAppStoreRowEntitled({ expires_at: null, grace_period_expires_at: null, revoked_at: null }, NOW)
    ).toBe(false);
  });

  it("only counts our auto-renewable products", () => {
    expect(isHouseholdSubscription(transactionPayload(), DEFAULT_PRODUCT_IDS)).toBe(true);
    expect(
      isHouseholdSubscription(transactionPayload({ productId: "co.rodor.homeapp.other" }), DEFAULT_PRODUCT_IDS)
    ).toBe(false);
    expect(
      isHouseholdSubscription(transactionPayload({ type: "Consumable" }), DEFAULT_PRODUCT_IDS)
    ).toBe(false);
  });

  it("reads the household id from appAccountToken only when it is a UUID", () => {
    expect(accountTokenOf({ appAccountToken: HOUSEHOLD_ID.toUpperCase() })).toBe(HOUSEHOLD_ID);
    expect(accountTokenOf({ appAccountToken: "not-a-uuid" })).toBeNull();
    expect(accountTokenOf({})).toBeNull();
  });

  it("builds a row from a transaction and keeps renewal facts it was not told", () => {
    const transaction = transactionPayload({ expiresDate: NOW.getTime() + 30 * day, signedDate: NOW.getTime() });
    const first = rowFromEvent(
      {
        transaction,
        renewal: { autoRenewStatus: 0, signedDate: NOW.getTime(), gracePeriodExpiresDate: undefined },
        environment: "Sandbox",
        notificationType: "DID_CHANGE_RENEWAL_STATUS",
        notificationSubtype: "AUTO_RENEW_DISABLED",
      },
      HOUSEHOLD_ID,
      null,
      NOW
    );
    expect(first.product_id).toBe(MONTHLY);
    expect(first.household_id).toBe(HOUSEHOLD_ID);
    expect(first.status).toBe("active");
    expect(first.auto_renew).toBe(false);
    expect(first.app_account_token).toBe(HOUSEHOLD_ID);

    const second = rowFromEvent(
      { transaction, environment: "Sandbox" },
      HOUSEHOLD_ID,
      { ...first, submitted_by: null },
      NOW
    );
    expect(second.auto_renew).toBe(false);
    expect(second.last_notification_type).toBe("DID_CHANGE_RENEWAL_STATUS");
  });

  it("ignores events older than the stored state", () => {
    const stored = { last_event_at: at(0) };
    expect(isStaleEvent(stored, NOW.getTime() - day)).toBe(true);
    expect(isStaleEvent(stored, NOW.getTime() + 1)).toBe(false);
    expect(isStaleEvent(null, NOW.getTime() - day)).toBe(false);
  });
});

describe("App Review demo account", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("does not exist unless REVIEW_DEMO_EMAIL is set", () => {
    vi.stubEnv("REVIEW_DEMO_EMAIL", "");
    expect(isReviewDemoEmail("anyone@example.com")).toBe(false);
    expect(isReviewDemoEmail(null)).toBe(false);
  });

  it("matches only that one address", () => {
    vi.stubEnv("REVIEW_DEMO_EMAIL", " Review@Example.com ");
    expect(isReviewDemoEmail("review@example.com")).toBe(true);
    expect(isReviewDemoEmail("REVIEW@EXAMPLE.COM")).toBe(true);
    expect(isReviewDemoEmail("other@example.com")).toBe(false);
    expect(isReviewDemoEmail("review@example.com.evil.test")).toBe(false);
    expect(isReviewDemoEmail(undefined)).toBe(false);
  });
});
