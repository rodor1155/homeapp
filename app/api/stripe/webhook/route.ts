import type Stripe from "stripe";
import {
  createStripeClient,
  householdIdForCustomer,
  isBillingConfigured,
  patchFromSubscription,
  saveSubscription,
  type SubscriptionPatch,
} from "@/lib/billing";

export const runtime = "nodejs";

/* Stripe tells us what a household is paying for; nothing else writes the
   `subscriptions` table. The signature is checked against the raw body, so the
   payload is read with request.text() and never parsed before verifying. */

function customerIdOf(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null
): string | null {
  if (!customer) return null;
  return typeof customer === "string" ? customer : customer.id;
}

/**
 * Which household an event belongs to. Checkout puts the id in metadata, and
 * everything after that is matched on the customer id we stored at checkout.
 */
async function resolveHousehold(
  metadataId: string | null | undefined,
  customerId: string | null
): Promise<string | null> {
  if (metadataId) return metadataId;
  return customerId ? await householdIdForCustomer(customerId) : null;
}

async function persist(
  householdId: string,
  patch: SubscriptionPatch
): Promise<void> {
  const { error } = await saveSubscription(householdId, patch);
  // Thrown, not returned: the caller answers 500 so Stripe retries the event.
  if (error) throw new Error(error);
}

async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session
): Promise<string> {
  const customerId = customerIdOf(session.customer);
  const householdId = await resolveHousehold(
    session.metadata?.household_id ?? session.client_reference_id,
    customerId
  );
  if (!householdId) return "no household on the session";

  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : (session.subscription?.id ?? null);

  if (!subscriptionId) {
    await persist(householdId, { stripe_customer_id: customerId });
    return "customer stored, no subscription on the session";
  }

  // The session carries no status or period, so read the subscription itself
  // rather than guess at what was bought.
  const subscription =
    await createStripeClient().subscriptions.retrieve(subscriptionId);

  await persist(householdId, {
    stripe_customer_id: customerId,
    ...patchFromSubscription(subscription),
  });
  return "subscription recorded";
}

async function handleSubscriptionEvent(
  subscription: Stripe.Subscription
): Promise<string> {
  const customerId = customerIdOf(subscription.customer);
  const householdId = await resolveHousehold(
    subscription.metadata?.household_id,
    customerId
  );
  if (!householdId) return "no household for this customer";

  await persist(householdId, {
    stripe_customer_id: customerId,
    ...patchFromSubscription(subscription),
  });
  return "subscription updated";
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();

  // With no key or secret there is nothing to verify against. 200 so Stripe
  // does not queue retries against a deployment that has never had billing on.
  if (!isBillingConfigured() || !secret) {
    return Response.json({ ok: true, ignored: "billing is not set up" });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return Response.json({ error: "missing signature" }, { status: 400 });
  }

  const payload = await request.text();

  let event: Stripe.Event;
  try {
    event = await createStripeClient().webhooks.constructEventAsync(
      payload,
      signature,
      secret
    );
  } catch (error) {
    console.warn(
      "[billing] rejected a webhook",
      error instanceof Error ? error.message : error
    );
    return Response.json({ error: "invalid signature" }, { status: 400 });
  }

  try {
    let outcome: string;

    switch (event.type) {
      case "checkout.session.completed":
        outcome = await handleCheckoutCompleted(event.data.object);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        outcome = await handleSubscriptionEvent(event.data.object);
        break;
      default:
        outcome = "ignored";
    }

    return Response.json({ received: true, event: event.type, outcome });
  } catch (error) {
    console.error(`[billing] ${event.type} failed`, error);
    return Response.json(
      { error: error instanceof Error ? error.message : "webhook failed" },
      { status: 500 }
    );
  }
}
