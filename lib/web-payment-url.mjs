/**
 * Hostnames used for web card checkout and billing management (Stripe).
 * Must not be opened inside the Hearth Home iOS shell (App Store Guideline 3.1.1).
 */

const WEB_PAYMENT_HOSTS = new Set([
  "stripe.com",
  "checkout.stripe.com",
  "billing.stripe.com",
  "pay.stripe.com",
  "connect.stripe.com",
  "invoice.stripe.com",
]);

/**
 * @param {string} url
 * @returns {boolean}
 */
export function isWebPaymentUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    const host = parsed.hostname.toLowerCase();
    if (WEB_PAYMENT_HOSTS.has(host)) return true;
    return host.endsWith(".stripe.com");
  } catch {
    return false;
  }
}
