"use client";

import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { useEffect } from "react";
import { isCapacitorNative } from "@/lib/is-capacitor-native";
import {
  isNativeOAuthReturnHandled,
  isNativeOAuthReturnUrl,
  markNativeOAuthReturnHandled,
  nativeOAuthReturnToWebCallback,
} from "@/lib/native-oauth";
import { createClient } from "@/lib/supabase-client";

function isAuthFlowPath(pathname: string): boolean {
  return (
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/sign-up") ||
    pathname.startsWith("/auth/")
  );
}

/**
 * Completes Google OAuth started via Browser.open by closing the in-app
 * browser and loading /auth/callback in the main WKWebView so Supabase
 * session cookies are established in the app shell.
 *
 * iOS keeps returning the same launch URL on resume; each handle is
 * deduplicated via sessionStorage so we never re-assign after login.
 */
export default function NativeOAuthListener() {
  useEffect(() => {
    if (!isCapacitorNative()) return;

    const completeOAuthInWebView = async (url: string) => {
      if (!isNativeOAuthReturnUrl(url)) return;
      if (isNativeOAuthReturnHandled(url)) return;

      // Claim before async work so remount/resume cannot double-handle.
      markNativeOAuthReturnHandled(url);

      const webCallback = nativeOAuthReturnToWebCallback(
        url,
        window.location.origin
      );
      const current = new URL(window.location.href);
      if (
        current.pathname === webCallback.pathname &&
        current.search === webCallback.search
      ) {
        return;
      }

      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session && !isAuthFlowPath(window.location.pathname)) {
        // Stale getLaunchUrl() after a completed login — stay on dashboard.
        return;
      }

      await Browser.close().catch(() => {});
      window.location.assign(webCallback.toString());
    };

    let cancelled = false;
    const listeners: Array<{ remove: () => void }> = [];

    void (async () => {
      const openListener = await App.addListener("appUrlOpen", ({ url }) => {
        void completeOAuthInWebView(url);
      });
      if (cancelled) {
        openListener.remove();
        return;
      }
      listeners.push(openListener);

      const launch = await App.getLaunchUrl();
      if (launch?.url) {
        void completeOAuthInWebView(launch.url);
      }
    })();

    return () => {
      cancelled = true;
      listeners.forEach((listener) => listener.remove());
    };
  }, []);

  return null;
}
