"use client";

import { useId, useState } from "react";
import { Button, Field } from "@/components/ui";
// Types only, so the server-only lookup module never reaches this bundle.
import type { AddressLookup, AddressSuggestion } from "@/lib/address-lookup";

/* Postcode in, address out — the shared front end of /api/address-lookup,
   used by a school's address on /family and the property's on /settings.
   Presentational and controlled: the picker never owns the address, it hands
   the lines it found to whoever rendered it.

   It is a convenience, not a gate. Whatever the lookup says, the address
   field underneath stays typeable — which is also what happens when no
   Ideal Postcodes key is set and only the postcode can be checked. */

type Props = {
  postcode: string;
  onPostcodeChange: (postcode: string) => void;
  /** Called once an address is chosen — lines for the field, org when Ideal named one. */
  onPick: (pick: { lines: string[]; organisation: string | null }) => void;
  /** Set to post the postcode with a surrounding form. */
  name?: string;
  label?: string;
};

export default function AddressPicker({
  postcode,
  onPostcodeChange,
  onPick,
  name,
  label = "Postcode",
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<AddressLookup | null>(null);
  const listId = useId();

  async function find() {
    setBusy(true);
    setError(null);
    setFound(null);

    try {
      const response = await fetch(
        `/api/address-lookup?postcode=${encodeURIComponent(postcode)}`
      );
      const body: unknown = await response.json().catch(() => null);

      if (body && typeof body === "object" && "error" in body) {
        setError(String((body as { error: unknown }).error));
        return;
      }
      if (!response.ok || !body) {
        setError("We couldn’t look that up just now.");
        return;
      }

      const lookup = body as AddressLookup;
      setFound(lookup);
      // The tidied postcode is the one worth keeping.
      if (lookup.postcode && lookup.postcode !== postcode) {
        onPostcodeChange(lookup.postcode);
      }
    } catch {
      setError("We couldn’t look that up just now.");
    } finally {
      setBusy(false);
    }
  }

  function choose(id: string) {
    const match = found?.suggestions.find(
      (suggestion: AddressSuggestion) => suggestion.id === id
    );
    if (match) {
      onPick({ lines: match.lines, organisation: match.organisation });
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Field label={label} hint="optional">
        <div className="flex items-start gap-2">
          <input
            name={name}
            type="text"
            autoComplete="postal-code"
            inputMode="text"
            value={postcode}
            onChange={(e) => onPostcodeChange(e.target.value)}
            className="field-input"
            placeholder="SW1A 1AA"
          />
          <Button
            type="button"
            variant="quiet"
            onClick={find}
            disabled={busy || postcode.trim().length === 0}
            className="shrink-0"
          >
            {busy ? "Looking…" : "Find"}
          </Button>
        </div>
      </Field>

      {error ? <p className="text-xs mark-fault">{error}</p> : null}

      {found && found.suggestions.length > 0 ? (
        <label className="flex flex-col gap-1.5" htmlFor={listId}>
          <span className="text-sm font-medium text-ink-soft">
            Pick the address
            <span className="tnum ml-2 font-normal text-ink-faint">
              {found.suggestions.length} at {found.postcode}
            </span>
          </span>
          <select
            id={listId}
            defaultValue=""
            onChange={(e) => choose(e.target.value)}
            className="field-input"
          >
            <option value="">Choose…</option>
            {found.suggestions.map((suggestion) => (
              <option key={suggestion.id} value={suggestion.id}>
                {suggestion.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {found?.message ? (
        <p className="text-xs text-ink-faint">{found.message}</p>
      ) : null}
    </div>
  );
}
