"use client";

import { useSyncExternalStore } from "react";
import { isCapacitorNative } from "@/lib/is-capacitor-native";

type HearthVaultPlugin = {
  openVault?: () => Promise<void>;
  openAdd?: () => Promise<void>;
};

type CapacitorWithPlugins = {
  isPluginAvailable?: (name: string) => boolean;
  registerPlugin?: <T>(name: string) => T;
  Plugins?: Record<string, unknown>;
};

let cachedPlugin: HearthVaultPlugin | null = null;

/**
 * Native plugins registered with `registerPluginInstance` on the iOS side are NOT
 * pre-populated on `Capacitor.Plugins` for a remote (server.url) page. Capacitor
 * exposes them through `isPluginAvailable(name)` (checks the native PluginHeaders)
 * and `registerPlugin(name)`, which returns the proxy. This is what the shell's own
 * www/vault-debug.html does too.
 */
function getHearthVaultPlugin(): HearthVaultPlugin | null {
  if (typeof window === "undefined") return null;
  if (cachedPlugin) return cachedPlugin;

  const cap = window.Capacitor as CapacitorWithPlugins | undefined;
  if (!cap) return null;

  try {
    if (cap.isPluginAvailable?.("HearthVault") !== true) {
      const existing = cap.Plugins?.HearthVault;
      if (existing && typeof existing === "object") {
        cachedPlugin = existing as HearthVaultPlugin;
        return cachedPlugin;
      }
      return null;
    }
    const proxy = cap.registerPlugin?.<HearthVaultPlugin>("HearthVault");
    if (!proxy) return null;
    cachedPlugin = proxy;
    return cachedPlugin;
  } catch {
    return null;
  }
}

/** True in a Capacitor shell when the HearthVault plugin is registered. */
export function hasNativeVault(): boolean {
  if (!isCapacitorNative()) return false;
  return getHearthVaultPlugin() != null;
}

export async function openNativeVault(): Promise<boolean> {
  if (!hasNativeVault()) return false;

  try {
    const plugin = getHearthVaultPlugin();
    if (!plugin?.openVault) return false;
    await plugin.openVault();
    return true;
  } catch {
    return false;
  }
}

export async function openNativeAdd(): Promise<boolean> {
  if (!hasNativeVault()) return false;

  try {
    const plugin = getHearthVaultPlugin();
    if (!plugin?.openAdd) return false;
    await plugin.openAdd();
    return true;
  } catch {
    return false;
  }
}

function subscribeNativeVault() {
  return () => {};
}

function getNativeVaultSnapshot(): boolean {
  return hasNativeVault();
}

function getNativeVaultServerSnapshot(): boolean {
  return false;
}

/** SSR-safe; false until the client can inspect the Capacitor bridge. */
export function useHasNativeVault(): boolean {
  return useSyncExternalStore(
    subscribeNativeVault,
    getNativeVaultSnapshot,
    getNativeVaultServerSnapshot,
  );
}
