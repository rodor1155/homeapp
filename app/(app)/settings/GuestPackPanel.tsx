"use client";

import { useActionState } from "react";
import { saveGuestPack, type GuestState } from "@/app/actions/guests";
import { Button, Field } from "@/components/ui";
import type { GuestPack } from "@/lib/guests";

export default function GuestPackPanel({ pack }: { pack: GuestPack | null }) {
  const [state, submit, pending] = useActionState<GuestState, FormData>(
    saveGuestPack,
    undefined
  );

  return (
    <form action={submit} className="flex flex-col gap-3">
      <p className="text-sm text-ink-soft">
        Handy notes for visitors — wifi, spare key, bins, school run. Shared with
        everyone in the household.
      </p>
      <Field label="Wifi name">
        <input
          name="wifi_name"
          className="field-input"
          defaultValue={pack?.wifi_name ?? ""}
          autoComplete="off"
        />
      </Field>
      <Field label="Wifi password">
        <input
          name="wifi_password"
          className="field-input"
          defaultValue={pack?.wifi_password ?? ""}
          autoComplete="off"
          type="text"
        />
      </Field>
      <Field label="Spare key">
        <input
          name="spare_key_note"
          className="field-input"
          defaultValue={pack?.spare_key_note ?? ""}
          placeholder="Under the plant pot / with next door"
        />
      </Field>
      <Field label="Bin day">
        <input
          name="bin_day_note"
          className="field-input"
          defaultValue={pack?.bin_day_note ?? ""}
          placeholder="Black bins Tuesday; recycling alternate weeks"
        />
      </Field>
      <Field label="School run">
        <input
          name="school_run_note"
          className="field-input"
          defaultValue={pack?.school_run_note ?? ""}
          placeholder="Leave by 8:10 · gate on Church Lane"
        />
      </Field>
      {state?.error ? (
        <p className="text-sm text-oxblood">{state.error}</p>
      ) : null}
      {state?.ok ? (
        <p className="text-sm text-sage">Saved.</p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save guest notes"}
      </Button>
    </form>
  );
}
