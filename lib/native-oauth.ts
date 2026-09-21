/** Custom URL scheme the native shell listens on to resume OAuth in the WebView. */
export const NATIVE_OAUTH_SCHEME_CALLBACK = "co.rodor.homeapp://auth/callback";

/** HTTPS bridge page: receives the OAuth redirect in the system browser, then deep-links into the app. */
export const NATIVE_OAUTH_BRIDGE_PATH = "/auth/native-bridge";

/** @deprecated kept for older shells that listened for oauth-callback only */
export const NATIVE_OAUTH_RETURN_URL = "co.rodor.homeapp://oauth-callback";

/** Query param marking an OAuth round-trip that started from the Capacitor Browser plugin. */
export const NATIVE_OAUTH_PARAM = "native";

export function isNativeOAuthCallback(searchParams: URLSearchParams): boolean {
  return searchParams.get(NATIVE_OAUTH_PARAM) === "1";
}

export function isNativeOAuthReturnUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol === "co.rodor.homeapp:" &&
      parsed.host === "auth" &&
      parsed.pathname === "/callback"
    ) {
      return true;
    }
    // Older shells used co.rodor.homeapp://oauth-callback
    return (
      parsed.protocol === "co.rodor.homeapp:" && parsed.host === "oauth-callback"
    );
  } catch {
    return false;
  }
}

/**
 * Supabase redirectTo when OAuth runs in SFSafariViewController / Browser plugin.
 * Bridge page deep-links back so session cookies are set in the WKWebView.
 */
export function nativeOAuthCallbackUrl(origin: string): string {
  const url = new URL(NATIVE_OAUTH_BRIDGE_PATH, origin);
  url.searchParams.set(NATIVE_OAUTH_PARAM, "1");
  return url.toString();
}

/** Callback URL when OAuth completes inside the main WKWebView (same-origin, no custom scheme). */
export function nativeOAuthInWebViewCallbackUrl(origin: string): string {
  return `${origin}/auth/callback`;
}

const NATIVE_OAUTH_HANDLED_STORAGE_PREFIX = "hearth-native-oauth-handled";

/** Stable key for deduplicating a native OAuth deep-link (code, hash, or full URL). */
export function getNativeOAuthDedupeKey(url: string): string | null {
  if (!isNativeOAuthReturnUrl(url)) return null;

  try {
    const parsed = new URL(url);
    const code = parsed.searchParams.get("code");
    if (code) return code;
    if (parsed.hash) return parsed.hash;
    return url;
  } catch {
    return null;
  }
}

export function isNativeOAuthReturnHandled(url: string): boolean {
  if (typeof sessionStorage === "undefined") return false;

  const dedupeKey = getNativeOAuthDedupeKey(url);
  if (!dedupeKey) return false;

  return (
    sessionStorage.getItem(`${NATIVE_OAUTH_HANDLED_STORAGE_PREFIX}:${dedupeKey}`) ===
    "1"
  );
}

/** Mark a native OAuth return URL as handled for this tab session. */
export function markNativeOAuthReturnHandled(url: string): void {
  if (typeof sessionStorage === "undefined") return;

  const dedupeKey = getNativeOAuthDedupeKey(url);
  if (!dedupeKey) return;

  sessionStorage.setItem(
    `${NATIVE_OAUTH_HANDLED_STORAGE_PREFIX}:${dedupeKey}`,
    "1"
  );
}

/** Map co.rodor.homeapp://auth/callback?… to same-origin /auth/callback?… */
export function nativeOAuthReturnToWebCallback(
  returnUrl: string,
  origin: string
): URL {
  const parsed = new URL(returnUrl);
  const webCallback = new URL("/auth/callback", origin);

  parsed.searchParams.forEach((value, key) => {
    if (key === NATIVE_OAUTH_PARAM) return;
    webCallback.searchParams.set(key, value);
  });

  if (parsed.hash) {
    webCallback.hash = parsed.hash;
  }

  return webCallback;
}
