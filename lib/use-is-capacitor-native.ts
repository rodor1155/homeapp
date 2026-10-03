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

function getUnresolvedServerSnapshot(): "unknown" {
  return "unknown";
}

function getResolvedClientSnapshot(): "native" | "web" {
  return isCapacitorNative() ? "native" : "web";
}

/**
 * Like useIsCapacitorNative, but distinguishes "not known yet" (server render
 * and first hydration pass) from "plain web". Use it to hide things that must
 * never flash inside the iPhone shell (billing/upgrade UI): treat "unknown" like native.
 */
export function useCapacitorNativeState(): "unknown" | "native" | "web" {
  return useSyncExternalStore(
    subscribeCapacitorNative,
    getResolvedClientSnapshot,
    getUnresolvedServerSnapshot,
  );
}
