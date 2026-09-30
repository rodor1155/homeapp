"use client";

import { useSyncExternalStore } from "react";
import { openNativeVault, useHasNativeVault } from "@/lib/native-vault";

function subscribeOnline(onStoreChange: () => void) {
  window.addEventListener("online", onStoreChange);
  window.addEventListener("offline", onStoreChange);
  return () => {
    window.removeEventListener("online", onStoreChange);
    window.removeEventListener("offline", onStoreChange);
  };
}

function getOnlineSnapshot(): boolean {
  return navigator.onLine;
}

function getOnlineServerSnapshot(): boolean {
  return true;
}

export default function OfflineBanner() {
  const online = useSyncExternalStore(
    subscribeOnline,
    getOnlineSnapshot,
    getOnlineServerSnapshot,
  );
  const nativeVault = useHasNativeVault();

  if (online) return null;

  return (
    <div
      role="status"
      className="sticky top-0 z-30 border-b border-rule bg-ochre-wash px-4 pb-2.5 pt-[max(0.5rem,env(safe-area-inset-top))] text-sm text-ink"
    >
      <p>
        You&apos;re offline — showing what was last loaded. Changes here will
        save when you&apos;re back online.
      </p>
      {nativeVault ? (
        <p className="mt-1">
          <button
            type="button"
            className="text-action text-sm"
            onClick={() => void openNativeVault()}
          >
            Your on-device documents still work
          </button>
        </p>
      ) : null}
    </div>
  );
}
