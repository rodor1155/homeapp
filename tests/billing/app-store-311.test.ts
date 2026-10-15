import { describe, expect, it } from "vitest";
import { isWebPaymentUrl } from "../../lib/web-payment-url.mjs";
import {
  isNativeShellRequest,
  NATIVE_SHELL_REQUEST_HEADER,
  WEB_CHECKOUT_BLOCKED_MESSAGE,
} from "@/lib/native-shell-request";

describe("App Store Guideline 3.1.1 helpers", () => {
  it("recognises Stripe checkout and billing hosts", () => {
    expect(isWebPaymentUrl("https://checkout.stripe.com/pay/cs_test")).toBe(true);
    expect(isWebPaymentUrl("https://billing.stripe.com/session/live")).toBe(true);
    expect(isWebPaymentUrl("https://pay.stripe.com/invoice")).toBe(true);
    expect(isWebPaymentUrl("https://hooks.stripe.com/foo")).toBe(true);
  });

  it("does not treat normal links as web payment URLs", () => {
    expect(isWebPaymentUrl("https://homeapp.example/dashboard")).toBe(false);
    expect(isWebPaymentUrl("mailto:hello@example.com")).toBe(false);
    expect(isWebPaymentUrl("not-a-url")).toBe(false);
  });

  it("blocks Stripe API routes from the native shell header", () => {
    const request = new Request("https://example.com/api/stripe/checkout", {
      method: "POST",
      headers: { [NATIVE_SHELL_REQUEST_HEADER]: "1" },
    });
    expect(isNativeShellRequest(request)).toBe(true);
  });

  it("blocks Stripe API routes from a Capacitor user agent", () => {
    const request = new Request("https://example.com/api/stripe/portal", {
      method: "POST",
      headers: { "user-agent": "Mozilla/5.0 Capacitor iOS" },
    });
    expect(isNativeShellRequest(request)).toBe(true);
  });

  it("allows Stripe API routes from a normal browser", () => {
    const request = new Request("https://example.com/api/stripe/checkout", {
      method: "POST",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      },
    });
    expect(isNativeShellRequest(request)).toBe(false);
  });

  it("uses a native-safe checkout refusal message", () => {
    expect(WEB_CHECKOUT_BLOCKED_MESSAGE).not.toMatch(/stripe/i);
    expect(WEB_CHECKOUT_BLOCKED_MESSAGE).not.toMatch(/card/i);
  });
});
