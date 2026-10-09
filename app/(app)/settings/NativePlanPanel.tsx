"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { EntitlementSource, Plan } from "@/lib/billing";
import type { Locale } from "@/lib/household";
import { Button } from "@/components/ui";
import {
  manageNativeSubscriptions,
  openNativePaywall,
  restoreNativePurchases,
  useHasNativeStore,
  type StoreActionResult,
} from "@/lib/native-store";

/* The Plan card inside the iPhone app. Subscriptions here are sold by Apple
   through the app's own paywall (StoreKit), which shows the price and terms;
   this card never quotes a price and never points anywhere else to pay. */

type Props = {
  configured: boolean;
  plan: Plan;
  source: EntitlementSource;
  householdId: string;
  locale: Locale | null;
  periodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

function formatDate(iso: string, locale: Locale): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale === "US" ? "en-US" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export default function NativePlanPanel({
  configured,
  plan,
  source,
  householdId,
  locale,
  periodEnd,
  cancelAtPeriodEnd,
}: Props) {
  const router = useRouter();
  const hasStore = useHasNativeStore();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function run(key: string, action: () => Promise<StoreActionResult>) {
    setError(null);
    setNotice(null);
    setPending(key);
    const result = await action();
    setPending(null);
    setError(result.error);
    if (result.notice) setNotice(result.notice);
    else if (result.changed && result.entitled && key !== "manage") {
      setNotice("Thank you — Hearth Household is now active.");
    }
    if (result.changed) router.refresh();
  }

  const messages = (
    <>
      {notice ? <p className="text-sm mark-filed">{notice}</p> : null}
      {error ? <p className="text-sm mark-fault">{error}</p> : null}
    </>
  );

  if (!configured) {
    return (
      <p className="text-sm text-ink-soft">
        Everything in Hearth is switched on for this household.
      </p>
    );
  }

  if (plan === "paid" && source === "app_store") {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-sm text-ink">
            You are on Hearth Household — export and everyone you share the
            household with.
          </p>
          {periodEnd ? (
            <p className="tnum mt-1 text-sm text-ink-soft">
              {cancelAtPeriodEnd ? "Ends on " : "Renews on "}
              {formatDate(periodEnd, locale ?? "UK")}
            </p>
          ) : null}
        </div>
        {messages}
        {hasStore ? (
          <div>
            <Button
              type="button"
              variant="quiet"
              disabled={pending !== null}
              onClick={() => run("manage", manageNativeSubscriptions)}
            >
              {pending === "manage" ? "Opening…" : "Manage subscription"}
            </Button>
            <p className="mt-2 text-xs text-ink-faint">
              Change or cancel your subscription with Apple.
            </p>
          </div>
        ) : null}
      </div>
    );
  }

  if (plan === "paid" && source === "review_demo") {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-ink">
          This is the App Review demo account. It has the full plan without a
          purchase.
        </p>
        {messages}
        {hasStore ? (
          <div>
            <Button
              type="button"
              variant="quiet"
              disabled={pending !== null}
              onClick={() => run("plans", () => openNativePaywall(householdId))}
            >
              {pending === "plans" ? "Opening…" : "See subscription options"}
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  if (plan === "paid") {
    return (
      <p className="text-sm text-ink">
        Your household is on the full plan — export and everyone you share the
        household with.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-sm text-ink">You are on the free plan.</p>
        <p className="mt-1 text-sm text-ink-soft">
          Hearth Household adds export and sharing the household with someone
          else.
        </p>
      </div>
      {messages}
      {hasStore ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={pending !== null}
            onClick={() => run("plans", () => openNativePaywall(householdId))}
          >
            {pending === "plans" ? "Opening…" : "See plans"}
          </Button>
          <Button
            type="button"
            variant="quiet"
            disabled={pending !== null}
            onClick={() => run("restore", restoreNativePurchases)}
          >
            {pending === "restore" ? "Restoring…" : "Restore purchases"}
          </Button>
        </div>
      ) : (
        <p className="text-xs text-ink-faint">
          Update Hearth Home from the App Store to see subscription options.
        </p>
      )}
    </div>
  );
}
