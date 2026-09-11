"use client";

import { useActionState, useEffect } from "react";
import { saveEvent, type FamilyState } from "@/app/actions/family";
import { Button, Field } from "@/components/ui";
import {
  EVENT_TYPES,
  EVENT_TYPE_LABEL,
  type HouseholdEvent,
  type HouseholdPerson,
} from "@/lib/family";

/* The one form for a key date. Lives here rather than in a route because two
   screens put it up: "Key dates" on /family, and "Add a date" on /calendar,
   where `defaultDate` is the month you are looking at so the date field opens
   somewhere useful. Both go through `saveEvent`, which revalidates /family,
   /calendar and /dashboard, so whichever one you added it from, all three
   have it. */

export default function EventForm({
  event,
  people,
  defaultDate,
  onDone,
  submitLabel,
}: {
  event?: HouseholdEvent;
  people: HouseholdPerson[];
  /** Pre-fills "When" for a new date. Ignored when editing one. */
  defaultDate?: string;
  onDone: () => void;
  submitLabel?: string;
}) {
  const [state, submit, pending] = useActionState<FamilyState, FormData>(
    saveEvent,
    undefined
  );

  useEffect(() => {
    if (state?.ok) onDone();
  }, [state?.ok, onDone]);

  return (
    <form action={submit} className="flex flex-col gap-3">
      {event ? <input type="hidden" name="event_id" value={event.id} /> : null}

      <Field label="What is it">
        <input
          name="title"
          type="text"
          required
          defaultValue={event?.title ?? ""}
          className="field-input"
          placeholder="Autumn term starts"
        />
      </Field>

      <Field label="When">
        <input
          name="event_date"
          type="date"
          required
          defaultValue={event?.event_date ?? defaultDate ?? ""}
          className="field-input tnum"
        />
      </Field>

      <Field label="Kind of date">
        <select
          name="event_type"
          defaultValue={event?.event_type ?? "home"}
          className="field-input"
        >
          {EVENT_TYPES.map((option) => (
            <option key={option} value={option}>
              {EVENT_TYPE_LABEL[option]}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Who it is for" hint="optional">
        <select
          name="person_id"
          defaultValue={event?.person_id ?? ""}
          className="field-input"
        >
          <option value="">The whole household</option>
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Anything worth noting" hint="optional">
        <textarea
          name="notes"
          rows={2}
          defaultValue={event?.notes ?? ""}
          className="field-input"
          placeholder="Non-uniform day"
        />
      </Field>

      {state?.error ? <p className="text-sm mark-fault">{state.error}</p> : null}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel ?? (event ? "Save" : "Add it")}
        </Button>
        <button type="button" onClick={onDone} className="text-action text-sm">
          Cancel
        </button>
      </div>
    </form>
  );
}
