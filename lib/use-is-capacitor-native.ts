"use client";

import { useSyncExternalStore } from "react";
import { isCapacitorNative } from "@/lib/is-capacitor-native";

function subscribeCapacitorNative() {
  return () => {};
}

function getCapacitorNativeSnapshot(): boolean {
  return isCapacitorNative();
}

function getCapacitorNativeServerSnapshot(): boolean {
  return false;
}

/** SSR-safe; false until the client can inspect the Capacitor bridge. */
export function useIsCapacitorNative(): boolean {
  return useSyncExternalStore(
    subscribeCapacitorNative,
    getCapacitorNativeSnapshot,
    getCapacitorNativeServerSnapshot,
  );
}
