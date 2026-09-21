/**
 * Origin for auth redirects. Prefer the baked public site URL when it is a
 * real deploy host so Capacitor / odd WebView origins never send OAuth back
 * to localhost.
 */
export function publicAppOrigin(): string {
  const fromEnv = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/+$/, "");
  if (fromEnv && !/localhost|127\.0\.0\.1/i.test(fromEnv)) {
    return fromEnv;
  }
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return fromEnv || "http://localhost:3000";
}
