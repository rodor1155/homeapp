import {
  createStripeClient,
  isBillingConfigured,
  loadSubscription,
  returnUrl,
} from "@/lib/billing";
import { loadHouseholdContext } from "@/lib/household";

export const runtime = "nodejs";

/* Stripe's own billing portal. This is the cancel path — one click from
   /settings to the page where the subscription can be ended, so we never hold
   a cancellation behind our own UI. */
export async function POST() {
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
    return Response.json(
      { error: "Billing is not set up yet." },
      { status: 503 }
    );
  }

  const subscription = await loadSubscription(household.id);
  if (!subscription?.stripe_customer_id) {
    return Response.json(
      { error: "There is nothing to manage on this household yet." },
      { status: 400 }
    );
  }

  try {
    const stripe = createStripeClient();
    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: returnUrl("/settings"),
    });

    return Response.json({ url: session.url });
  } catch (error) {
    console.error("[billing] portal session failed", error);
    return Response.json(
      { error: "Could not open the billing portal. Please try again." },
      { status: 502 }
    );
  }
}
