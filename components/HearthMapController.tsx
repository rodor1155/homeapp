"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  hasHearthMap,
  hideHearthMap,
  setHearthMapAppearance,
  showHearthMap,
} from "@/lib/hearth-map";

function subscribeDark(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

function clientDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * Shows Apple MapKit behind a transparent Home web layer when the native
 * HearthMap plugin is available; hides it everywhere else.
 *
 * `hearth-native-map-active` is applied only after `show()` resolves true so
 * we never leave a transparent WebView over the cream fallback when MapKit fails.
 */
export default function HearthMapController({
  mapCenter,
}: {
  mapCenter: { lat: number; lng: number } | null;
}) {
  const pathname = usePathname();
  const onHome = pathname === "/dashboard" || pathname.startsWith("/dashboard/");
  const dark = useSyncExternalStore(subscribeDark, clientDark, () => false);
  const pluginAvailable = hasHearthMap();
  const [nativeMapVisible, setNativeMapVisible] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle(
      "hearth-native-map-active",
      nativeMapVisible
    );
    return () => {
      document.documentElement.classList.remove("hearth-native-map-active");
    };
  }, [nativeMapVisible]);

  useEffect(() => {
    if (!pluginAvailable || !nativeMapVisible) return;
    void setHearthMapAppearance(dark);
  }, [pluginAvailable, nativeMapVisible, dark]);

  useEffect(() => {
    let cancelled = false;

    if (!pluginAvailable || !onHome || !mapCenter) {
      setNativeMapVisible(false);
      void hideHearthMap();
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      const shown = await showHearthMap({
        lat: mapCenter.lat,
        lng: mapCenter.lng,
        dark,
      });
      if (cancelled) return;
      setNativeMapVisible(shown);
      if (!shown) {
        await hideHearthMap();
      }
    })();

    return () => {
      cancelled = true;
      setNativeMapVisible(false);
      void hideHearthMap();
    };
  }, [pluginAvailable, onHome, mapCenter, dark]);

  return null;
}
