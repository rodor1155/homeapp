"use client";

import { createClient } from "@/lib/supabase-client";
import {
  nativeOAuthCallbackUrl,
  nativeOAuthInWebViewCallbackUrl,
} from "@/lib/native-oauth";
import { publicAppOrigin } from "@/lib/public-app-origin";

type CapacitorBrowserPlugin = {
  open: (options: { url: string }) => Promise<void>;
};

function getCapacitorBrowserPlugin(): CapacitorBrowserPlugin | null {
  const plugin = window.Capacitor?.Plugins?.Browser as
    | CapacitorBrowserPlugin
    | undefined;
  return plugin?.open ? plugin : null;
}

/**
 * Google OAuth for Capacitor shells.
 *
 * Default path: Capacitor Browser plugin (SFSafariViewController) with redirectTo
 * /auth/native-bridge so NativeOAuthListener deep-links back into the WKWebView.
 * Avoids navigating accounts.google.com in the main WebView, which on iOS remote
 * URL shells often hands off to system Safari/Brave and yields Google 400 errors.
 *
 * Opt-in only: useInWebView navigates Google OAuth inside the main WKWebView via
 * location.assign. Unreliable on iOS; may hit disallowed_useragent or system-browser handoff.
 */
export async function signInWithGoogleNative(options?: {
  /** Opt in to in-WebView navigation instead of SFSafariViewController. */
  useInWebView?: boolean;
}): Promise<{ error: string | null }> {
  const supabase = createClient();
  const useInWebView = options?.useInWebView === true;
  const origin = publicAppOrigin();
  const redirectTo = useInWebView
    ? nativeOAuthInWebViewCallbackUrl(origin)
    : nativeOAuthCallbackUrl(origin);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });

  if (error || !data.url) {
    return { error: error?.message ?? "Could not start Google sign-in." };
  }

  if (useInWebView) {
    window.location.assign(data.url);
    return { error: null };
  }

  const browser = getCapacitorBrowserPlugin();
  if (browser) {
    await browser.open({ url: data.url });
    return { error: null };
  }

  const { Browser } = await import("@capacitor/browser");
  await Browser.open({ url: data.url });
  return { error: null };
}
