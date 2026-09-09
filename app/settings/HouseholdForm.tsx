"use client";

import { useActionState, useState, useTransition } from "react";
import {
  updateHousehold,
  type HouseholdInput,
  type SettingsState,
} from "@/app/actions/settings";
import type { Locale } from "@/lib/household";
import { PROPERTY_TYPES } from "@/lib/property";
import { Button, Field } from "@/components/ui";

type Props = {
  defaultName: string;
  defaultLocale: Locale | null;
  defaultAddress: string;
  defaultType: string;
  defaultYearBuilt: number | null;
};

export default function HouseholdForm({
  defaultName,
  defaultLocale,
  defaultAddress,
  defaultType,
  defaultYearBuilt,
}: Props) {
  const [state, dispatch] = useActionState<SettingsState, HouseholdInput>(
    updateHousehold,
    undefined
  );
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState(defaultName);
  const [locale, setLocale] = useState<Locale | "">(defaultLocale ?? "");
  const [address, setAddress] = useState(defaultAddress);
  const [type, setType] = useState(defaultType);
  const [yearBuilt, setYearBuilt] = useState(
    defaultYearBuilt ? String(defaultYearBuilt) : ""
  );

  const complete =
    name.trim().length > 0 &&
    address.trim().length > 0 &&
    (locale === "UK" || locale === "US");

  function save() {
    startTransition(() => {
      dispatch({ name, locale, address, type, yearBuilt });
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Field label="Household name">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="field-input"
          placeholder="Our household"
        />
      </Field>

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

      <Field
        label="Dates and money"
        note="This sets how dates, amounts and everyday terms are shown."
      >
        <select
          value={locale}
          onChange={(e) => setLocale(e.target.value as Locale | "")}
          className="field-input"
        >
          <option value="">Choose…</option>
          <option value="UK">United Kingdom</option>
          <option value="US">United States</option>
        </select>
      </Field>

      {state?.error ? (
        <p className="text-sm mark-fault">{state.error}</p>
      ) : null}
      {state?.ok ? <p className="text-sm mark-filed">Saved.</p> : null}

      <div>
        <Button
          type="button"
          disabled={isPending || !complete}
          onClick={save}
        >
          {isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
