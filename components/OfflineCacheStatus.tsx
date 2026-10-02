"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui";
import { SW_PRIME_HREFS } from "@/lib/app-routes";
import { isCapacitorNative } from "@/lib/is-capacitor-native";

// Read every page cache (hearth-pages-<version>) so a service-worker version bump never
// makes this line report zero. Keys carry their kind in a query parameter because the
// Cache API ignores URL fragments.
const PAGE_CACHE_PREFIX = "hearth-pages-";

type CacheStatus =
  | { kind: "unavailable" }
  | { kind: "inactive" }
  | { kind: "ready"; count: number };

async function readDocEntryCount(): Promise<CacheStatus> {
  if (
    typeof window === "undefined" ||
    !("serviceWorker" in navigator) ||
    !("caches" in window)
  ) {
    return { kind: "unavailable" };
  }

  if (!navigator.serviceWorker.controller) {
    return { kind: "inactive" };
  }

  try {
    const names = (await caches.keys()).filter((name) =>
      name.startsWith(PAGE_CACHE_PREFIX),
    );
    let count = 0;

    for (const name of names) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        const url = new URL(request.url);
        if (url.searchParams.get("__hearth") === "doc") count += 1;
      }
    }

    if (count === 0) return { kind: "inactive" };
    return { kind: "ready", count };
  } catch {
    return { kind: "unavailable" };
  }
}

/** Shell-only offline page cache status for Settings. */
export default function OfflineCacheStatus() {
  const [status, setStatus] = useState<CacheStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const next = await readDocEntryCount();
    setStatus(next);
  }, []);

  const handleRefresh = useCallback(async () => {
    setBusy(true);
    try {
      if ("serviceWorker" in navigator && navigator.onLine) {
        const registration = await navigator.serviceWorker.ready;
        registration.active?.postMessage({
          type: "prime-pages",
          urls: [...SW_PRIME_HREFS],
        });
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      await refresh();
    } catch {
      await refresh();
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  useEffect(() => {
    if (!isCapacitorNative()) return;

    let cancelled = false;

    const load = async () => {
      const next = await readDocEntryCount();
      if (!cancelled) setStatus(next);
    };

    void load();
    const timer = setTimeout(() => void load(), 4000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  if (typeof window !== "undefined" && !isCapacitorNative()) {
    return null;
  }

  if (status === null) {
    return null;
  }

  let message: string;
  if (status.kind === "unavailable") {
    message = "Offline cache: unavailable";
  } else if (status.kind === "inactive") {
    message =
      "Offline cache: not active yet — open the app online for a moment";
  } else {
    message = `Offline cache: ${status.count} pages saved`;
  }

  return (
    <Card title="Offline cache">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink-soft">{message}</p>
        <button
          type="button"
          className="text-action shrink-0 text-xs disabled:opacity-50"
          onClick={() => void handleRefresh()}
          disabled={busy}
        >
          Refresh
        </button>
      </div>
    </Card>
  );
}
