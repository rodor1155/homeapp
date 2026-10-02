"use client";

import { useEffect } from "react";
import { SW_PRIME_HREFS } from "@/lib/app-routes";
import { isCapacitorNative } from "@/lib/is-capacitor-native";

const PRIME_DELAY_MS = 3000;
const PRIME_INTERVAL_MS = 6 * 60 * 60 * 1000;
const SW_BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";

let lastPrimeAt = 0;

function shouldSkipPriming(): boolean {
  const path = window.location.pathname;
  return (
    path === "/sign-in" || path === "/sign-up" || path === "/onboarding"
  );
}

async function primePages(): Promise<void> {
  try {
    if (!navigator.onLine || shouldSkipPriming()) return;

    const registration = await navigator.serviceWorker.ready;
    const worker = registration.active;
    if (!worker) return;

    worker.postMessage({ type: "prime-pages", urls: [...SW_PRIME_HREFS] });
    lastPrimeAt = Date.now();
  } catch {
    // Never throw from priming.
  }
}

/** Registers the offline SW only inside the Capacitor production shell. */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    const inNativeShell =
      process.env.NODE_ENV === "production" && isCapacitorNative();

    if (inNativeShell) {
      let cancelled = false;
      let onVisible: (() => void) | null = null;

      void navigator.serviceWorker
        .register(`/sw.js?v=${encodeURIComponent(SW_BUILD_ID)}`, { scope: "/" })
        .then(async () => {
          if (cancelled) return;

          try {
            await navigator.serviceWorker.ready;
            if (cancelled || !navigator.onLine || shouldSkipPriming()) return;

            setTimeout(() => {
              if (!cancelled) void primePages();
            }, PRIME_DELAY_MS);

            onVisible = () => {
              if (document.visibilityState !== "visible") return;
              if (!navigator.onLine || shouldSkipPriming()) return;
              if (Date.now() - lastPrimeAt < PRIME_INTERVAL_MS) return;
              void primePages();
            };
            document.addEventListener("visibilitychange", onVisible);
          } catch {
            // Never throw from priming setup.
          }
        })
        .catch((err) => {
          console.warn("[sw] registration failed", err);
        });

      return () => {
        cancelled = true;
        if (onVisible) {
          document.removeEventListener("visibilitychange", onVisible);
        }
      };
    }

    void navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        void registration.unregister();
      }
    });
  }, []);

  return null;
}
