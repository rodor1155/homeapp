import {
  createStripeClient,
  isBillingConfigured,
  loadSubscription,
  planKeyFor,
  priceIdFor,
  returnUrl,
  saveSubscription,
  type BillingInterval,
} from "@/lib/billing";
import { loadHouseholdContext } from "@/lib/household";

export const runtime = "nodejs";

// The copy the client shows when billing has not been turned on yet.
const NOT_SET_UP = "Billing is not set up yet.";

function readInterval(body: unknown): BillingInterval {
  const interval = (body as { interval?: unknown } | null)?.interval;
  return interval === "yearly" ? "yearly" : "monthly";
}

export async function POST(request: Request) {
  const { user, household } = await loadHouseholdContext();
  if (!user) {
    return Response.json({ error: "You are not signed in." }, { status: 401 });
  }
  if (!household) {
    return Response.json(
      { error: "No household found for your account." },
      { status: 400 }
    );
  }

  if (!isBillingConfigured()) {
    return Response.json({ error: NOT_SET_UP }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const interval = readInterval(body);

  const price = priceIdFor(household.locale, interval);
  if (!price) {
    console.warn(
      `[billing] no price configured for ${planKeyFor(household.locale, interval)}`
    );
    return Response.json({ error: NOT_SET_UP }, { status: 503 });
  }

  try {
    const stripe = createStripeClient();
    const existing = await loadSubscription(household.id);
    let customerId = existing?.stripe_customer_id ?? null;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        name: household.name,
        metadata: { household_id: household.id },
      });
      customerId = customer.id;

      // Remembered now so a second attempt reuses the customer, and so the
      // webhook can find the household from the customer id alone.
      const { error } = await saveSubscription(household.id, {
        stripe_customer_id: customerId,
      });
      if (error) {
        console.error("[billing] could not store the Stripe customer", error);
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price, quantity: 1 }],
      // Both, because the row may not exist yet when the event arrives.
      client_reference_id: household.id,
      metadata: { household_id: household.id },
      subscription_data: { metadata: { household_id: household.id } },
      success_url: returnUrl("/settings?billing=success"),
      cancel_url: returnUrl("/settings"),
      allow_promotion_codes: true,
    });

    if (!session.url) {
      return Response.json(
        { error: "Stripe did not return a checkout link." },
        { status: 502 }
      );
    }

    return Response.json({ url: session.url });
  } catch (error) {
    console.error("[billing] checkout failed", error);
    return Response.json(
      { error: "Could not start checkout. Please try again." },
      { status: 502 }
    );
  }
}
