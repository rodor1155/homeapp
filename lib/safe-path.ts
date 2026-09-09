/**
 * A `?next=` value always arrives from a URL, so treat it as untrusted: only
 * a same-site path is allowed through, never an absolute or protocol-relative
 * URL. Anything else falls back to the app root.
 */
export function safeNextPath(
  value: string | string[] | null | undefined,
  fallback = "/"
): string {
  const raw = typeof value === "string" ? value.trim() : "";
  return /^\/(?!\/)[\w\-./?=&%#]*$/.test(raw) ? raw : fallback;
}
