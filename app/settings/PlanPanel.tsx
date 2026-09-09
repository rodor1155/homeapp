"use client";

import { useState } from "react";
import type { BillingInterval, Plan } from "@/lib/billing";
import type { Locale } from "@/lib/household";
import { Button } from "@/components/ui";

/* What each plan costs, as it is said to the household. Keep these in step
   with the Stripe prices behind STRIPE_PRICE_GBP_* / STRIPE_PRICE_USD_*. */
const PRICES: Record<Locale, Record<BillingInterval, string>> = {
  UK: { monthly: "£4.99 a month", yearly: "£39 a year" },
  US: { monthly: "$6.99 a month", yearly: "$59 a year" },
};

type Props = {
  configured: boolean;
  plan: Plan;
  locale: Locale | null;
  /** ISO timestamp from the subscriptions row, if Stripe has told us one. */
  periodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  justPaid: boolean;
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

export default function PlanPanel({
  configured,
  plan,
  locale,
  periodEnd,
  cancelAtPeriodEnd,
  justPaid,
}: Props) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const prices = PRICES[locale ?? "UK"];

  async function open(
    key: string,
    path: string,
    body: Record<string, string> = {}
  ) {
    setError(null);
    setPending(key);
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };

      if (response.ok && payload.url) {
        // Stripe's page, not ours, so leave the app rather than route to it.
        window.location.href = payload.url;
        return;
      }
      setError(payload.error ?? "Something went wrong. Please try again.");
    } catch {
      setError("Could not reach Stripe. Please try again.");
    }
    setPending(null);
  }

  if (!configured) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-ink-soft">
          Everything in homeapp is switched on for this household.
        </p>
        <p className="text-xs text-ink-faint">Billing isn’t set up yet.</p>
      </div>
    );
  }

  if (plan === "paid") {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-sm text-ink">
            You are on the full plan — unlimited reminders, export, and
            everyone you share the household with.
          </p>
          {periodEnd ? (
            <p className="tnum mt-1 text-sm text-ink-soft">
              {cancelAtPeriodEnd ? "Ends on " : "Renews on "}
              {formatDate(periodEnd, locale ?? "UK")}
            </p>
          ) : null}
        </div>

        {error ? <p className="text-sm mark-fault">{error}</p> : null}

        <div>
          <Button
            type="button"
            variant="quiet"
            disabled={pending !== null}
            onClick={() => open("portal", "/api/stripe/portal")}
          >
            {pending ? "Opening…" : "Manage billing"}
          </Button>
          <p className="mt-2 text-xs text-ink-faint">
            Change card, see invoices, or cancel in one click.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-sm text-ink">
          You are on the free plan: keep as many documents as you like, with up
          to three reminders running.
        </p>
        <p className="mt-1 text-sm text-ink-soft">
          Paying adds unlimited reminders, export, and sharing the household
          with someone else.
        </p>
      </div>

      {justPaid ? (
        <p className="text-sm mark-filed">
          Thank you — your plan is being brought up to date. Reload in a moment
          if it still says free.
        </p>
      ) : null}
      {error ? <p className="text-sm mark-fault">{error}</p> : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={pending !== null}
          onClick={() =>
            open("monthly", "/api/stripe/checkout", { interval: "monthly" })
          }
        >
          {pending === "monthly" ? "Opening…" : prices.monthly}
        </Button>
        <Button
          type="button"
          variant="quiet"
          disabled={pending !== null}
          onClick={() =>
            open("yearly", "/api/stripe/checkout", { interval: "yearly" })
          }
        >
          {pending === "yearly" ? "Opening…" : prices.yearly}
        </Button>
      </div>
      <p className="text-xs text-ink-faint">
        Cancel any time from this page. No refunds needed — the plan simply
        stops at the end of the period.
      </p>
    </div>
  );
}
