/* The two plans, as they are said to the household. Client-safe: what a
   household is actually allowed to do is decided in lib/billing.ts. */

/** How many renewals the free plan tracks in the iPhone app. */
export const FREE_RENEWAL_LIMIT = 5;

/** Days of free trial on the yearly plan, the first time a household subscribes. */
export const YEARLY_TRIAL_DAYS = 7;

export const FREE_PLAN_COPY = `The free plan is for one person: up to ${FREE_RENEWAL_LIMIT} renewals, scanning included.`;

/** What Hearth Household adds. The iPhone app's paywall says the same. */
export const PAID_PLAN_COPY =
  "Share with your household, unlimited renewals, private document vault";
