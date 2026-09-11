import "server-only";

/* Tiny in-process throttle + TTL cache for metered third-party routes.
 * Fine on a single Node instance (Vercel serverless may reset between
 * isolates); enough to blunt burst abuse and cut repeat Ideal lookups. */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const cache = new Map<string, { expiresAt: number; value: unknown }>();

/**
 * True when `key` is still inside its limit for this window. Call once per
 * attempted paid/expensive lookup — a false means the caller should 429.
 */
export function takeToken(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number }
): boolean {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (existing.count >= limit) return false;
  existing.count += 1;
  return true;
}

export function cacheGet<T>(key: string): T | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (hit.expiresAt <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return hit.value as T;
}

export function cacheSet(key: string, value: unknown, ttlMs: number): void {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  // Soft bound so a long-lived isolate can't grow forever.
  if (cache.size > 500) {
    const now = Date.now();
    for (const [k, entry] of cache) {
      if (entry.expiresAt <= now) cache.delete(k);
    }
  }
}
