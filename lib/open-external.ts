"use client";

import { isCapacitorNative } from "@/lib/is-capacitor-native";
import { shouldOpenExternalLink as shouldOpenExternalLinkImpl } from "./open-external-link.mjs";

export type OpenExternalOptions = {
  /** In a plain browser, navigate the current tab instead of opening a new one. */
  sameTab?: boolean;
};

/** Whether an anchor click should open in the system browser sheet (Capacitor). */
export function shouldOpenExternalLink(
  href: string,
  pageOrigin: string,
  options?: { download?: boolean }
): boolean {
  return shouldOpenExternalLinkImpl(href, pageOrigin, options);
}

/**
 * Open a URL outside the WKWebView when running in the native shell.
 * In a plain browser, preserves prior behaviour: same-tab navigation or a new tab.
 */
export async function openExternalUrl(
  url: string,
  options?: OpenExternalOptions
): Promise<void> {
  if (isCapacitorNative()) {
    try {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url });
      return;
    } catch {
      window.open(url, "_blank", "noopener");
      return;
    }
  }

  if (options?.sameTab) {
    window.location.href = url;
  } else {
    window.open(url, "_blank", "noopener");
  }
}
