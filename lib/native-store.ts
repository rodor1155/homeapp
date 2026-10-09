"use client";

import { useSyncExternalStore } from "react";
import { getNativePlugin } from "@/lib/native-plugin";

/* The iPhone app's StoreKit bridge. The app shows Apple's purchase sheet and
   hands back signed transactions; they mean nothing until the server has
   verified them (POST /api/appstore/transactions), which is what actually
   switches the household's plan. */

type Signed = { signedTransactions?: string[] };

type PaywallResult = Signed & { purchased?: boolean; restored?: boolean };

type ListenerHandle = { remove: () => void | Promise<void> };

type HearthStorePlugin = {
  getEntitlements?: () => Promise<Signed>;
  openPaywall?: (options: { appAccountToken?: string }) => Promise<PaywallResult>;
  restorePurchases?: () => Promise<Signed & { message?: string }>;
  manageSubscriptions?: () => Promise<Signed>;
  addListener?: (
    event: "transactionsUpdated",
    listener: (data: Signed) => void
  ) => Promise<ListenerHandle> | ListenerHandle;
};

function plugin(): HearthStorePlugin | null {
  return getNativePlugin<HearthStorePlugin>("HearthStore");
}

/** True in an iPhone app build that sells the subscription in-app. */
export function hasNativeStore(): boolean {
  return typeof plugin()?.openPaywall === "function";
}

function subscribe() {
  return () => {};
}

/** SSR-safe; false until the client can inspect the Capacitor bridge. */
export function useHasNativeStore(): boolean {
  return useSyncExternalStore(subscribe, hasNativeStore, () => false);
}

function messageOf(error: unknown, fallback: string): string {
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === "string" && message ? message : fallback;
}

export type SubmitResult = {
  ok: boolean;
  entitled: boolean;
  error: string | null;
};

/** Sends signed transactions to the server, which verifies them with Apple's root. */
export async function submitSignedTransactions(
  signedTransactions: string[]
): Promise<SubmitResult> {
  if (signedTransactions.length === 0) {
    return { ok: true, entitled: false, error: null };
  }
  try {
    const response = await fetch("/api/appstore/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signedTransactions }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      entitled?: boolean;
      error?: string;
    };
    if (!response.ok) {
      return {
        ok: false,
        entitled: false,
        error: payload.error ?? "We could not update your plan. Please try again.",
      };
    }
    return { ok: true, entitled: payload.entitled === true, error: null };
  } catch {
    return {
      ok: false,
      entitled: false,
      error:
        "Your purchase went through, but we could not reach Hearth Home to update your plan. It will catch up next time you open the app.",
    };
  }
}

export type StoreActionResult = {
  /** Something was bought or restored and the server has been told. */
  changed: boolean;
  entitled: boolean;
  error: string | null;
  /** Not a failure — e.g. "nothing to restore". */
  notice: string | null;
};

const NOTHING: StoreActionResult = {
  changed: false,
  entitled: false,
  error: null,
  notice: null,
};

/** Opens the native paywall. `householdId` ties the purchase to this household. */
export async function openNativePaywall(
  householdId: string
): Promise<StoreActionResult> {
  const store = plugin();
  if (!store?.openPaywall) return NOTHING;

  let result: PaywallResult;
  try {
    result = await store.openPaywall({ appAccountToken: householdId });
  } catch (error) {
    return {
      ...NOTHING,
      error: messageOf(error, "The subscription screen could not be opened."),
    };
  }

  const signed = result.signedTransactions ?? [];
  if (signed.length === 0) return NOTHING;
  const submitted = await submitSignedTransactions(signed);
  return {
    changed: submitted.ok,
    entitled: submitted.entitled,
    error: submitted.error,
    notice: null,
  };
}

export async function restoreNativePurchases(): Promise<StoreActionResult> {
  const store = plugin();
  if (!store?.restorePurchases) return NOTHING;

  try {
    const result = await store.restorePurchases();
    const signed = result.signedTransactions ?? [];
    if (signed.length === 0) {
      return {
        ...NOTHING,
        notice:
          result.message ||
          "No active subscription was found for this Apple Account.",
      };
    }
    const submitted = await submitSignedTransactions(signed);
    return {
      changed: submitted.ok,
      entitled: submitted.entitled,
      error: submitted.error,
      notice: null,
    };
  } catch (error) {
    return {
      ...NOTHING,
      error: messageOf(error, "Your purchases could not be restored."),
    };
  }
}

/** Apple's own manage-subscription sheet. */
export async function manageNativeSubscriptions(): Promise<StoreActionResult> {
  const store = plugin();
  if (!store?.manageSubscriptions) return NOTHING;
  try {
    const result = await store.manageSubscriptions();
    const signed = result.signedTransactions ?? [];
    const submitted = await submitSignedTransactions(signed);
    return {
      changed: true,
      entitled: submitted.entitled,
      error: submitted.error,
      notice: null,
    };
  } catch (error) {
    return {
      ...NOTHING,
      error: messageOf(error, "Your subscriptions could not be opened."),
    };
  }
}

/** What this Apple Account currently holds, as signed transactions. */
export async function currentNativeEntitlements(): Promise<string[]> {
  const store = plugin();
  if (!store?.getEntitlements) return [];
  try {
    return (await store.getEntitlements()).signedTransactions ?? [];
  } catch {
    return [];
  }
}

/** Renewals and approvals that arrive while the app is open. */
export async function onNativeTransactionsUpdated(
  listener: (signedTransactions: string[]) => void
): Promise<() => void> {
  const store = plugin();
  if (!store?.addListener) return () => {};
  try {
    const handle = await store.addListener("transactionsUpdated", (data) => {
      const signed = data?.signedTransactions ?? [];
      if (signed.length > 0) listener(signed);
    });
    return () => {
      void handle.remove();
    };
  } catch {
    return () => {};
  }
}
