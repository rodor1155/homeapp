import "server-only";

import Stripe from "stripe";
import type { Locale } from "@/lib/household";
import { createAdminClient } from "@/lib/supabase-admin";

/* What a household is allowed to do, and the Stripe plumbing behind it.
   Billing is optional: with no STRIPE_SECRET_KEY set, nothing here reaches
   Stripe and every household gets the unlimited entitlements, so the gates
   are inert until someone actually turns billing on.

   `subscriptions` rows are written by the service role only, so every write in
   here goes through the admin client. Reads take a household id the caller has
   already resolved for the signed-in user. */

export type Plan = "free" | "paid";
export type BillingInterval = "monthly" | "yearly";

/** The price a household is on, e.g. 'gbp_monthly'. Stored in `plan`. */
export type PlanKey = `${"gbp" | "usd"}_${BillingInterval}`;

export type Entitlements = {
  plan: Plan;
  canExport: boolean;
  /** Active reminders allowed, or null for no limit. */
  reminderLimit: number | null;
  activeSubscription: boolean;
};

export type SubscriptionRow = {
  household_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: string;
  plan: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

export const SUBSCRIPTION_SELECT =
  "household_id, stripe_customer_id, stripe_subscription_id, status, plan, current_period_end, cancel_at_period_end";

/** Stripe statuses that count as paid. Everything else is treated as free. */
const PAID_STATUSES = ["active", "trialing"];

/** Free households keep every document, but only a handful of live reminders. */
export const FREE_REMINDER_LIMIT = 3;

const PAID: Entitlements = {
  plan: "paid",
  canExport: true,
  reminderLimit: null,
  activeSubscription: true,
};

const FREE: Entitlements = {
  plan: "free",
  canExport: false,
  reminderLimit: FREE_REMINDER_LIMIT,
  activeSubscription: false,
};

const PRICE_ENV: Record<PlanKey, string> = {
  gbp_monthly: "STRIPE_PRICE_GBP_MONTHLY",
  gbp_yearly: "STRIPE_PRICE_GBP_YEARLY",
  usd_monthly: "STRIPE_PRICE_USD_MONTHLY",
  usd_yearly: "STRIPE_PRICE_USD_YEARLY",
};

/** True only when there is a Stripe key to talk to. */
export function isBillingConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

/** Callers must check isBillingConfigured() first; this throws if they didn't. */
export function createStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    throw new Error(
      "Missing STRIPE_SECRET_KEY — billing is not set up. Guard with isBillingConfigured() before calling createStripeClient()."
    );
  }
  return new Stripe(key);
}

/** Absolute URL for Stripe to send the customer back to. */
export function returnUrl(path: string): string {
  const base = (
    process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
  ).replace(/\/+$/, "");
  return `${base}${path}`;
}

export function planKeyFor(
  locale: Locale | null,
  interval: BillingInterval
): PlanKey {
  return `${locale === "US" ? "usd" : "gbp"}_${interval}`;
}

/** The configured Stripe price for a household's currency, or null if unset. */
export function priceIdFor(
  locale: Locale | null,
  interval: BillingInterval
): string | null {
  return process.env[PRICE_ENV[planKeyFor(locale, interval)]]?.trim() || null;
}

/** Which of our four prices a Stripe price id is, for recording `plan`. */
export function planForPriceId(priceId: string | null): PlanKey | null {
  if (!priceId) return null;
  for (const key of Object.keys(PRICE_ENV) as PlanKey[]) {
    if (process.env[PRICE_ENV[key]]?.trim() === priceId) return key;
  }
  return null;
}

export function isPaidStatus(status: string | null | undefined): boolean {
  return Boolean(status && PAID_STATUSES.includes(status));
}

export async function loadSubscription(
  householdId: string
): Promise<SubscriptionRow | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("subscriptions")
    .select(SUBSCRIPTION_SELECT)
    .eq("household_id", householdId)
    .maybeSingle();

  if (error) {
    console.warn("[billing] could not read the subscription", error.message);
    return null;
  }
  return (data as SubscriptionRow | null) ?? null;
}

/**
 * What this household may do. With billing unconfigured everyone is on the
 * paid set, so adding a gate never takes something away from existing users.
 * Once it is configured, no readable subscription means free — a household
 * only gets the paid entitlements off a status Stripe told us about.
 */
export async function getEntitlements(
  householdId: string
): Promise<Entitlements> {
  if (!isBillingConfigured()) return { ...PAID };

  const subscription = await loadSubscription(householdId);
  return isPaidStatus(subscription?.status) ? { ...PAID } : { ...FREE };
}

export type SubscriptionPatch = Partial<Omit<SubscriptionRow, "household_id">>;

/** Writes what Stripe told us, creating the household's row if it has none. */
export async function saveSubscription(
  householdId: string,
  patch: SubscriptionPatch
): Promise<{ error: string | null }> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("subscriptions").upsert(
    {
      household_id: householdId,
      ...patch,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "household_id" }
  );
  return { error: error?.message ?? null };
}

/** The household behind a Stripe customer — how webhook events find us. */
export async function householdIdForCustomer(
  customerId: string
): Promise<string | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("subscriptions")
    .select("household_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  return (data?.household_id as string | undefined) ?? null;
}

/**
 * When the household is next billed. Stripe keeps the period on the
 * subscription's items rather than the subscription, so take the last one to
 * end.
 */
export function periodEndFrom(subscription: Stripe.Subscription): string | null {
  let latest: number | null = null;
  for (const item of subscription.items?.data ?? []) {
    const end = item.current_period_end;
    if (typeof end === "number" && (latest === null || end > latest)) {
      latest = end;
    }
  }
  return latest === null ? null : new Date(latest * 1000).toISOString();
}

/** The patch for a subscription event: status, price, period and cancellation. */
export function patchFromSubscription(
  subscription: Stripe.Subscription
): SubscriptionPatch {
  const priceId = subscription.items?.data[0]?.price?.id ?? null;
  return {
    stripe_subscription_id: subscription.id,
    status: subscription.status,
    plan: planForPriceId(priceId),
    current_period_end: periodEndFrom(subscription),
    cancel_at_period_end: subscription.cancel_at_period_end,
  };
}
