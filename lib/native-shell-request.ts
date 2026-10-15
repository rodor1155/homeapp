import "server-only";

/** Set on WKWebView requests from the Hearth Home iOS shell when configured. */
export const NATIVE_SHELL_REQUEST_HEADER = "x-hearth-native-shell";

/**
 * True when the request likely comes from the Capacitor / WKWebView shell rather
 * than a desktop or mobile browser. Used to refuse web checkout API routes.
 */
export function isNativeShellRequest(request: Request): boolean {
  if (request.headers.get(NATIVE_SHELL_REQUEST_HEADER) === "1") {
    return true;
  }
  const ua = request.headers.get("user-agent") ?? "";
  if (/\bCapacitor\b/i.test(ua)) return true;
  if (/HearthHome/i.test(ua)) return true;
  return false;
}

export const WEB_CHECKOUT_BLOCKED_MESSAGE =
  "Subscriptions in the iPhone app are handled through the App Store. Open Settings and choose See plans.";
