"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  currentNativeEntitlements,
  hasNativeStore,
  onNativeTransactionsUpdated,
  submitSignedTransactions,
} from "@/lib/native-store";

const SYNCED_KEY = "hearth-appstore-synced";

/** Enough of each JWS to tell two sets of transactions apart. */
function fingerprint(signed: string[]): string {
  return signed
    .map((jws) => jws.slice(-48))
    .sort()
    .join("|");
}

/**
 * Keeps the server's view of the App Store subscription current while the
 * iPhone app is open: once per session it submits what this Apple Account
 * holds (so a purchase whose submission was interrupted, or one made on
 * another device, still counts), and it forwards renewals as they arrive.
 * Renders nothing, and does nothing outside the app.
 */
export default function NativeStoreSync() {
  const router = useRouter();

  useEffect(() => {
    if (!hasNativeStore()) return;
    let cancelled = false;
    let stop: (() => void) | null = null;

    const submit = async (signed: string[], force: boolean) => {
      if (signed.length === 0) return;
      const print = fingerprint(signed);
      if (!force && sessionStorage.getItem(SYNCED_KEY) === print) return;
      const result = await submitSignedTransactions(signed);
      if (cancelled || !result.ok) return;
      sessionStorage.setItem(SYNCED_KEY, print);
      router.refresh();
    };

    void (async () => {
      await submit(await currentNativeEntitlements(), false);
      const remove = await onNativeTransactionsUpdated((signed) => {
        void submit(signed, true);
      });
      if (cancelled) remove();
      else stop = remove;
    })();

    return () => {
      cancelled = true;
      stop?.();
    };
  }, [router]);

  return null;
}
