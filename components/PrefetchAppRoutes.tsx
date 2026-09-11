"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { APP_WARM_HREFS } from "@/lib/app-routes";

/**
 * As soon as the signed-in shell is up, pull every tab (and settings) into the
 * Client Cache so the first tap does not wait on the network. Re-warms when
 * the tab becomes visible again, before staleTimes would force a miss.
 */
export default function PrefetchAppRoutes() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    const timers: number[] = [];

    const warm = () => {
      APP_WARM_HREFS.forEach((href, index) => {
        // Stagger so the current page's stream is not competing with four
        // full prefetches on the same tick.
        const id = window.setTimeout(() => {
          if (cancelled) return;
          router.prefetch(href);
        }, index * 120);
        timers.push(id);
      });
    };

    warm();

    const onVisible = () => {
      if (document.visibilityState === "visible") warm();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      for (const id of timers) window.clearTimeout(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  return null;
}
