"use client";

import { useEffect } from "react";
import { APP_NAME } from "@/lib/brand";
import { NATIVE_OAUTH_PARAM, NATIVE_OAUTH_SCHEME_CALLBACK } from "@/lib/native-oauth";

const WEB_FALLBACK_DELAY_MS = 1500;

/**
 * Runs inside the Capacitor Browser after Google OAuth.
 * Immediately deep-links into the app so the WKWebView can exchange the code
 * (cookies must be set in the WebView, not in SFSafariViewController).
 *
 * Belt-and-braces fallback: if this page is reached from a plain browser
 * (native detection false positive, or the app isn't installed), the custom
 * scheme navigation silently no-ops and this page would otherwise hang on
 * "Returning to Hearth Home…" forever. If the document is still visible after
 * a short delay — meaning the OS never handed off to the app — fall back to
 * completing the OAuth exchange in this same browser tab.
 */
export default function NativeOAuthBridgePage() {
  useEffect(() => {
    const { search, hash } = window.location;
    // Custom URL scheme hand-off to the native shell — not a Next.js route.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- deep link
    window.location.href = `${NATIVE_OAUTH_SCHEME_CALLBACK}${search}${hash}`;

    const timer = window.setTimeout(() => {
      if (document.visibilityState !== "visible") return;

      const params = new URLSearchParams(search);
      params.delete(NATIVE_OAUTH_PARAM);
      const query = params.toString();
      const fallbackUrl = new URL("/auth/callback", window.location.origin);
      fallbackUrl.search = query;
      fallbackUrl.hash = hash;
      window.location.replace(fallbackUrl.toString());
    }, WEB_FALLBACK_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-6 text-center">
      <p className="text-sm text-ink-soft">Returning to {APP_NAME}…</p>
    </main>
  );
}
