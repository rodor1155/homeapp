"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import {
  deleteSchool,
  refreshSchoolCalendar,
  saveSchool,
  type FamilyState,
} from "@/app/actions/family";
import AddressPicker from "@/components/AddressPicker";
import { Button, Field } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import {
  calendarEventDate,
  type HouseholdPerson,
  type School,
  type SchoolCalendarEvent,
} from "@/lib/family";
import type { Locale } from "@/lib/household";

type Props = {
  schools: School[];
  people: HouseholdPerson[];
  calendarEvents: SchoolCalendarEvent[];
  locale: Locale;
};

/** How many of a school's own dates are worth showing on the row. */
const PREVIEW_DATES = 3;

/** "Ada", "Ada and Sam", "Ada, Sam and Ida". */
function listNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export default function SchoolsPanel({
  schools,
  people,
  calendarEvents,
  locale,
}: Props) {
  const [adding, setAdding] = useState(false);
  const stopAdding = useCallback(() => setAdding(false), []);

  return (
    <div className="flex flex-col gap-4">
      {schools.length === 0 ? (
        <p className="text-sm text-ink-faint">
          No schools yet. Add one and you can put each child in it.
        </p>
      ) : (
        <ul className="divide-y divide-rule">
          {schools.map((school) => (
            <SchoolRow
              key={school.id}
              school={school}
              attending={people.filter(
                (person) => person.school_id === school.id
              )}
              dates={calendarEvents
                .filter((event) => event.school_id === school.id)
                .slice(0, PREVIEW_DATES)}
              locale={locale}
            />
          ))}
        </ul>
      )}

      <div className="border-t border-rule pt-4">
        {adding ? (
          <SchoolForm onDone={stopAdding} />
        ) : (
          <Button type="button" variant="quiet" onClick={() => setAdding(true)}>
            Add a school
          </Button>
        )}
      </div>
    </div>
  );
}

function SchoolRow({
  school,
  attending,
  dates,
  locale,
}: {
  school: School;
  attending: HouseholdPerson[];
  dates: SchoolCalendarEvent[];
  locale: Locale;
}) {
  const [editing, setEditing] = useState(false);
  const stopEditing = useCallback(() => setEditing(false), []);

  // "Ada (Year 5) and Sam (Year 3)" — the year in brackets rather than after
  // a comma, so two children don't read as four names.
  const who = listNames(
    attending.map((person) =>
      person.year_group ? `${person.name} (${person.year_group})` : person.name
    )
  );

  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{school.name}</p>
          <p className="text-xs text-ink-faint">
            {who || "Nobody at it yet"}
          </p>
          {school.address ? (
            <p className="mt-0.5 whitespace-pre-line text-xs text-ink-soft">
              {school.address}
            </p>
          ) : school.postcode ? (
            <p className="mt-0.5 text-xs text-ink-soft">{school.postcode}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setEditing((open) => !open)}
          className="text-action shrink-0 text-sm"
        >
          {editing ? "Close" : "Edit"}
        </button>
      </div>

      {school.calendar_url ? (
        <SchoolCalendar school={school} dates={dates} locale={locale} />
      ) : null}

      {editing ? (
        <div className="mt-3 rounded-lg bg-paper-sunk p-3">
          <SchoolForm school={school} onDone={stopEditing} />
          <RemoveSchool school={school} attending={attending.length} />
        </div>
      ) : null}
    </li>
  );
}

/**
 * What the school's own calendar says, and how the last read of it went. The
 * error kept on the school is shown as-is — it is already a sentence.
 */
function SchoolCalendar({
  school,
  dates,
  locale,
}: {
  school: School;
  dates: SchoolCalendarEvent[];
  locale: Locale;
}) {
  const [state, submit, pending] = useActionState<FamilyState, FormData>(
    refreshSchoolCalendar,
    undefined
  );

  const label = school.calendar_title?.trim() || "School calendar";
  const trouble = state?.error ?? school.calendar_last_error;
  const syncedOn = school.calendar_last_synced_at?.slice(0, 10);

  return (
    <div className="mt-2.5 rounded bg-paper-sunk px-3 py-2.5">
      <form action={submit} className="flex items-baseline justify-between gap-3">
        <input type="hidden" name="school_id" value={school.id} />
        <p className="min-w-0 truncate text-xs font-medium text-ink">{label}</p>
        <button
          type="submit"
          disabled={pending}
          className="text-action shrink-0 text-xs"
        >
          {pending ? "Reading…" : "Refresh"}
        </button>
      </form>

      <p
        className={`tnum mt-0.5 text-xs ${
          trouble ? "mark-fault" : "text-ink-faint"
        }`}
      >
        {trouble ??
          (syncedOn
            ? `Last read ${formatDate(syncedOn, locale)}`
            : "Not read yet")}
      </p>

      {dates.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1">
          {dates.map((event) => {
            const on = calendarEventDate(event.starts_at);
            return (
              <li
                key={event.id}
                className="flex items-baseline justify-between gap-3 text-xs"
              >
                <span className="min-w-0 truncate text-ink">{event.title}</span>
                <span className="tnum shrink-0 text-ink-faint">
                  {on ? formatDate(on, locale) : ""}
                </span>
              </li>
            );
          })}
        </ul>
      ) : trouble ? null : (
        <p className="mt-1 text-xs text-ink-faint">
          Nothing in the next few months.
        </p>
      )}
    </div>
  );
}

function SchoolForm({
  school,
  onDone,
}: {
  school?: School;
  onDone: () => void;
}) {
  const [state, submit, pending] = useActionState<FamilyState, FormData>(
    saveSchool,
    undefined
  );
  // The address is controlled only so the postcode picker can fill it in.
  // Typing over it afterwards is the point, not an edge case.
  const [postcode, setPostcode] = useState(school?.postcode ?? "");
  const [address, setAddress] = useState(school?.address ?? "");
  const [name, setName] = useState(school?.name ?? "");

  useEffect(() => {
    if (state?.ok) onDone();
  }, [state?.ok, onDone]);

  return (
    <form action={submit} className="flex flex-col gap-3">
      {school ? (
        <input type="hidden" name="school_id" value={school.id} />
      ) : null}

      <Field label="School name">
        <input
          name="name"
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="field-input"
          placeholder="St Mary’s Primary"
        />
      </Field>

      <AddressPicker
        name="postcode"
        postcode={postcode}
        onPostcodeChange={setPostcode}
        onPick={(pick) => {
          // Named premises (schools, offices) fill the school name; the
          // address field keeps the street/town without repeating that name.
          if (pick.organisation) {
            setName(pick.organisation);
            const withoutOrg = pick.lines.filter(
              (line) => line !== pick.organisation
            );
            setAddress(withoutOrg.join("\n"));
          } else {
            setAddress(pick.lines.join("\n"));
          }
        }}
      />

      <Field label="Address" hint="optional">
        <textarea
          name="address"
          rows={3}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className="field-input"
          placeholder="School Lane, Town"
        />
      </Field>

      <Field label="Anything worth noting" hint="optional">
        <textarea
          name="notes"
          rows={2}
          defaultValue={school?.notes ?? ""}
          className="field-input"
          placeholder="Office hours, who to ring about absences"
        />
      </Field>

      <Field
        label="Calendar link"
        hint="optional"
        note="The school's term-dates calendar — the “subscribe” or iCal link off its website. We read it, we never write to it."
      >
        <input
          name="calendar_url"
          type="url"
          inputMode="url"
          defaultValue={school?.calendar_url ?? ""}
          className="field-input"
          placeholder="https://school.example/calendar.ics"
        />
      </Field>

      <Field label="What to call that calendar" hint="optional">
        <input
          name="calendar_title"
          type="text"
          defaultValue={school?.calendar_title ?? ""}
          className="field-input"
          placeholder="Term dates"
        />
      </Field>

      {state?.error ? (
        <p className="text-sm mark-fault">{state.error}</p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : school ? "Save" : "Add it"}
        </Button>
        <button type="button" onClick={onDone} className="text-action text-sm">
          Cancel
        </button>
      </div>
    </form>
  );
}

function RemoveSchool({
  school,
  attending,
}: {
  school: School;
  attending: number;
}) {
  const [state, submit, pending] = useActionState<FamilyState, FormData>(
    deleteSchool,
    undefined
  );
  const [confirming, setConfirming] = useState(false);

  return (
    <form
      action={submit}
      className="mt-3 flex items-center justify-between gap-3 border-t border-rule pt-3"
    >
      <input type="hidden" name="school_id" value={school.id} />
      <p className={`text-xs ${state?.error ? "mark-fault" : "text-ink-faint"}`}>
        {state?.error ??
          (confirming
            ? "Remove this school?"
            : attending > 0
              ? `${attending} ${
                  attending === 1 ? "child stays" : "children stay"
                }, just without a school.`
              : "Nothing else is attached to it.")}
      </p>
      {confirming ? (
        <button
          type="submit"
          disabled={pending}
          className="text-action mark-fault shrink-0 text-sm"
        >
          {pending ? "Removing…" : "Yes, remove"}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="text-action shrink-0 text-sm"
        >
          Remove
        </button>
      )}
    </form>
  );
}
