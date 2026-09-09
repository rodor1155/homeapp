"use client";

import { useActionState, useState, useTransition } from "react";
import {
  completeOnboarding,
  type OnboardingInput,
  type OnboardingState,
} from "@/app/actions/onboarding";
import type { Locale } from "@/lib/household";
import { PROPERTY_TYPES } from "@/lib/property";
import { Button, Field, Wordmark } from "@/components/ui";

type Props = {
  defaultLocale: Locale | null;
  defaultAddress: string;
  defaultType: string;
  defaultYearBuilt: number | null;
};

const STEPS = ["Where your home is", "About the property", "Sharing"] as const;

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
  const isLast = step === STEPS.length - 1;

  function finish() {
    startTransition(() => {
      dispatch({ locale, address, type, yearBuilt, partnerEmail });
    });
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center px-5 py-12">
      <div className="ledger-bound">
        <Wordmark className="text-sm" />

        <div className="mt-4">
          <p className="text-sm text-ink-soft">
            Step {step + 1} of {STEPS.length}
          </p>
          <h1 className="mt-1 text-2xl">{STEPS[step]}</h1>
        </div>

        <div className="mt-7 flex flex-col gap-4">
          {step === 0 && (
            <>
              <p className="text-sm text-ink-soft">
                This sets how dates, money and everyday terms are shown.
              </p>
              <div className="flex flex-col gap-2">
                {(["UK", "US"] as const).map((code) => {
                  const on = locale === code;
                  return (
                    <label
                      key={code}
                      className={`flex cursor-pointer items-center gap-3 rounded border px-3.5 py-2.5 text-sm transition-colors ${
                        on
                          ? "border-ink bg-ochre-tint"
                          : "border-rule-strong hover:bg-paper-sunk"
                      }`}
                    >
                      <input
                        type="radio"
                        name="locale"
                        value={code}
                        checked={on}
                        onChange={() => setLocale(code)}
                      />
                      <span>
                        {code === "UK" ? "United Kingdom" : "United States"}
                      </span>
                    </label>
                  );
                })}
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <Field label="Property address">
                <textarea
                  rows={3}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="field-input"
                  placeholder="123 Example Street, Town, Postcode"
                />
              </Field>
              <Field label="Property type" hint="optional">
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="field-input"
                >
                  <option value="">Choose…</option>
                  {PROPERTY_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Year built" hint="optional">
                <input
                  type="number"
                  inputMode="numeric"
                  min={1000}
                  max={2100}
                  value={yearBuilt}
                  onChange={(e) => setYearBuilt(e.target.value)}
                  className="field-input tnum"
                  placeholder="e.g. 1998"
                />
              </Field>
            </>
          )}

          {step === 2 && (
            <>
              <Field label="Invite a partner by email" hint="optional">
                <input
                  type="email"
                  autoComplete="off"
                  value={partnerEmail}
                  onChange={(e) => setPartnerEmail(e.target.value)}
                  className="field-input"
                  placeholder="partner@example.com"
                />
              </Field>
              <p className="text-xs text-ink-faint">
                We just note the invite for now. They will be able to join the
                household later.
              </p>
            </>
          )}

          {state?.error ? (
            <p className="text-sm mark-fault">{state.error}</p>
          ) : null}

          <div className="mt-2 flex items-center justify-between">
            {step > 0 ? (
              <button
                type="button"
                className="text-action text-sm"
                onClick={() => setStep((s) => Math.max(0, s - 1))}
              >
                Back
              </button>
            ) : (
              <span />
            )}
            {isLast ? (
              <Button type="button" disabled={isPending} onClick={finish}>
                {isPending ? "Setting up…" : "Open the file"}
              </Button>
            ) : (
              <Button
                type="button"
                disabled={
                  (step === 0 && !canLeaveLocation) ||
                  (step === 1 && !canLeaveProperty)
                }
                onClick={() => setStep((s) => s + 1)}
              >
                Continue
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
