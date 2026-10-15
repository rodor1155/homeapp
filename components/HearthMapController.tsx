"use client";

import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
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
 */
export default function HearthMapController({
  mapCenter,
}: {
  mapCenter: { lat: number; lng: number } | null;
}) {
  const pathname = usePathname();
  const onHome = pathname === "/dashboard" || pathname.startsWith("/dashboard/");
  const dark = useSyncExternalStore(subscribeDark, clientDark, () => false);
  const nativeMap = hasHearthMap();

  useEffect(() => {
    document.documentElement.classList.toggle(
      "hearth-native-map-active",
      nativeMap && onHome && mapCenter != null
    );
    return () => {
      document.documentElement.classList.remove("hearth-native-map-active");
    };
  }, [nativeMap, onHome, mapCenter]);

  useEffect(() => {
    if (!nativeMap) return;
    void setHearthMapAppearance(dark);
  }, [nativeMap, dark]);

  useEffect(() => {
    if (!nativeMap) return;

    if (!onHome || !mapCenter) {
      void hideHearthMap();
      return;
    }

    void showHearthMap({
      lat: mapCenter.lat,
      lng: mapCenter.lng,
      dark,
    });

    return () => {
      void hideHearthMap();
    };
  }, [nativeMap, onHome, mapCenter, dark]);

  return null;
}
