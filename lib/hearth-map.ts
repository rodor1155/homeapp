"use client";

import { getNativePlugin } from "@/lib/native-plugin";

export type HearthMapShowOptions = {
  lat: number;
  lng: number;
  /** When true, MapKit uses dark cartography; matches prefers-color-scheme: dark. */
  dark: boolean;
};

export type HearthMapPlugin = {
  show: (options: HearthMapShowOptions) => Promise<void>;
  hide: () => Promise<void>;
  setAppearance: (options: { dark: boolean }) => Promise<void>;
};

function plugin(): HearthMapPlugin | null {
  return getNativePlugin<HearthMapPlugin>("HearthMap");
}

export function hasHearthMap(): boolean {
  return typeof plugin()?.show === "function";
}

export async function showHearthMap(options: HearthMapShowOptions): Promise<boolean> {
  const map = plugin();
  if (!map?.show) return false;
  try {
    await map.show(options);
    return true;
  } catch {
    return false;
  }
}

export async function hideHearthMap(): Promise<void> {
  const map = plugin();
  if (!map?.hide) return;
  try {
    await map.hide();
  } catch {
    /* shell may already be hidden */
  }
}

export async function setHearthMapAppearance(dark: boolean): Promise<void> {
  const map = plugin();
  if (!map?.setAppearance) return;
  try {
    await map.setAppearance({ dark });
  } catch {
    /* ignore */
  }
}
