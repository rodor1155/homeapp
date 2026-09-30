"use client";

import { useEffect } from "react";
import { isCapacitorNative } from "@/lib/is-capacitor-native";

/** Registers the offline SW only inside the Capacitor production shell. */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    const inNativeShell =
      process.env.NODE_ENV === "production" && isCapacitorNative();

    if (inNativeShell) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch((err) => {
          console.warn("[sw] registration failed", err);
        });
      return;
    }

    void navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        void registration.unregister();
      }
    });
  }, []);

  return null;
}
