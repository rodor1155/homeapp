"use client";

import { useActionState, useState, useTransition } from "react";
import {
  completeOnboarding,
  type OnboardingInput,
  type OnboardingState,
} from "@/app/actions/onboarding";
import type { Locale } from "@/lib/household";

const inputCls =
  "rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50";
const btnPrimary =
  "rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50";
const btnGhost =
  "rounded-md border border-black/15 px-4 py-2 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/5";

type Props = {
  defaultLocale: Locale | null;
  defaultAddress: string;
  defaultType: string;
  defaultYearBuilt: number | null;
};

const STEPS = ["Location", "Property", "Partner"] as const;

const PROPERTY_TYPES = [
  "House",
  "Flat / Apartment",
  "Bungalow",
  "Condo",
  "Townhouse",
  "Other",
];

export default function OnboardingWizard({
  defaultLocale,
  defaultAddress,
  defaultType,
  defaultYearBuilt,
}: Props) {
  const [state, dispatch] = useActionState<OnboardingState, OnboardingInput>(
    completeOnboarding,
    undefined
  );
  const [isPending, startTransition] = useTransition();

  const [step, setStep] = useState(0);
  const [locale, setLocale] = useState<Locale | "">(defaultLocale ?? "");
  const [address, setAddress] = useState(defaultAddress);
  const [type, setType] = useState(defaultType);
  const [yearBuilt, setYearBuilt] = useState(
    defaultYearBuilt ? String(defaultYearBuilt) : ""
  );
  const [partnerEmail, setPartnerEmail] = useState("");

  const canLeaveLocation = locale === "UK" || locale === "US";
  const canLeaveProperty = address.trim().length > 0;

  function finish() {
    startTransition(() => {
      dispatch({ locale, address, type, yearBuilt, partnerEmail });
    });
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-4 py-12">
      <div>
        <p className="text-xs uppercase tracking-wide opacity-50">
          Step {step + 1} of {STEPS.length} · {STEPS[step]}
        </p>
        <h1 className="mt-1 text-xl font-semibold">Set up your household</h1>
      </div>

      {step === 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-sm opacity-70">
            Where is your home? This sets dates, currency and terminology.
          </p>
          {(["UK", "US"] as const).map((code) => (
            <label
              key={code}
              className="flex items-center gap-3 rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/20"
            >
              <input
                type="radio"
                name="locale"
                value={code}
                checked={locale === code}
                onChange={() => setLocale(code)}
              />
              {code === "UK" ? "United Kingdom" : "United States"}
            </label>
          ))}
        </div>
      )}

      {step === 1 && (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Property address
            <textarea
              rows={3}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className={inputCls}
              placeholder="123 Example Street, Town, Postcode"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Property type <span className="opacity-50">(optional)</span>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className={inputCls}
            >
              <option value="">Choose…</option>
              {PROPERTY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Year built <span className="opacity-50">(optional)</span>
            <input
              type="number"
              inputMode="numeric"
              min={1000}
              max={2100}
              value={yearBuilt}
              onChange={(e) => setYearBuilt(e.target.value)}
              className={inputCls}
              placeholder="e.g. 1998"
            />
          </label>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Invite a partner by email{" "}
            <span className="opacity-50">(optional)</span>
            <input
              type="email"
              autoComplete="off"
              value={partnerEmail}
              onChange={(e) => setPartnerEmail(e.target.value)}
              className={inputCls}
              placeholder="partner@example.com"
            />
          </label>
          <p className="text-xs opacity-60">
            We just record the invite for now — they will be able to join the
            household later.
          </p>
        </div>
      )}

      {state?.error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      ) : null}

      <div className="flex items-center justify-between">
        <button
          type="button"
          className={btnGhost}
          hidden={step === 0}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
        >
          Back
        </button>
        <div className="ml-auto">
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              className={btnPrimary}
              disabled={
                (step === 0 && !canLeaveLocation) ||
                (step === 1 && !canLeaveProperty)
              }
              onClick={() => setStep((s) => s + 1)}
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              className={btnPrimary}
              disabled={isPending}
              onClick={finish}
            >
              {isPending ? "Finishing…" : "Finish"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
