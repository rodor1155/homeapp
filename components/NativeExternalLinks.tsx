"use client";

import { useEffect } from "react";
import { isCapacitorNative } from "@/lib/is-capacitor-native";
import { openExternalUrl, shouldOpenExternalLink } from "@/lib/open-external";

/**
 * Intercepts cross-origin http(s) anchor clicks in the Capacitor shell so they
 * open in SFSafariViewController instead of the app-bound WKWebView.
 */
export default function NativeExternalLinks() {
  useEffect(() => {
    if (!isCapacitorNative()) return;

    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.defaultPrevented) return;

      const target = event.target;
      if (!(target instanceof Element)) return;

      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;

      if (
        !shouldOpenExternalLink(anchor.href, window.location.origin, {
          download: anchor.hasAttribute("download"),
        })
      ) {
        return;
      }

      event.preventDefault();
      void openExternalUrl(anchor.href);
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}
