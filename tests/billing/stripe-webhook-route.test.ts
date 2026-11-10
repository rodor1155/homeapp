import { beforeEach, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";

/* POST /api/stripe/webhook must never touch subscription state without a
   verified Stripe signature. A missing webhook secret is a server misconfig,
   not a silent no-op. */

import { POST } from "@/app/api/stripe/webhook/route";

const TEST_WEBHOOK_SECRET = "whsec_test_stripe_webhook_signing_secret";
const TEST_STRIPE_KEY = "sk_test_000000000000000000000000000000000000000000000000000000000000";

const minimalEvent = {
  id: "evt_test_webhook",
  object: "event",
  type: "customer.updated",
  data: { object: { id: "cus_test", object: "customer" } },
} as const;

function post(payload: string, signature: string | null) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (signature !== null) {
    headers["stripe-signature"] = signature;
  }
  return POST(
    new Request("https://homeapp.test/api/stripe/webhook", {
      method: "POST",
      headers,
      body: payload,
    })
  );
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("webhook signing secret", () => {
  it("answers 503 when STRIPE_WEBHOOK_SECRET is missing", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", TEST_STRIPE_KEY);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await post(JSON.stringify(minimalEvent), "t=1,v1=deadbeef");
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toEqual({ error: "webhook signing is not configured" });
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("STRIPE_WEBHOOK_SECRET is not set")
    );
  });
});

describe("signature verification", () => {
  beforeEach(() => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", TEST_WEBHOOK_SECRET);
    vi.stubEnv("STRIPE_SECRET_KEY", TEST_STRIPE_KEY);
  });

  it("answers 400 to a bad signature", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const response = await post(JSON.stringify(minimalEvent), "t=1,v1=not_a_real_signature");
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toEqual({ error: "invalid signature" });
    expect(warn).toHaveBeenCalled();
  });

  it("answers 200 when the signature matches", async () => {
    const payload = JSON.stringify(minimalEvent);
    const stripe = new Stripe(TEST_STRIPE_KEY);
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: TEST_WEBHOOK_SECRET,
    });

    const response = await post(payload, signature);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      received: true,
      event: "customer.updated",
      outcome: "ignored",
    });
  });
});
