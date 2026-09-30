/**
 * Remove signed-in page data from Cache Storage and tell the active SW.
 *
 * Never throws and never hangs: callers (sign-out, account deletion) must always be able
 * to proceed. `navigator.serviceWorker.ready` is deliberately NOT used — it never
 * resolves when no worker is registered (every plain browser), which would block
 * sign-out forever. `getRegistration()` resolves with undefined instead.
 */
export const CLEAR_OFFLINE_CACHE_TIMEOUT_MS = 1500;

async function clearNow(): Promise<void> {
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("hearth-"))
          .map((key) => caches.delete(key)),
      );
    }
  } catch {
    // Cache Storage unavailable — nothing to clear.
  }

  try {
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      registration?.active?.postMessage({ type: "clear-caches" });
    }
  } catch {
    // No worker to notify — the page-context delete above is enough.
  }
}

export async function clearOfflineCache(): Promise<void> {
  if (typeof window === "undefined") return;

  await Promise.race([
    clearNow(),
    new Promise<void>((resolve) => {
      setTimeout(resolve, CLEAR_OFFLINE_CACHE_TIMEOUT_MS);
    }),
  ]);
}
