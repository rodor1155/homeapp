"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import {
  deleteHouseholdCalendar,
  refreshHouseholdCalendar,
  saveHouseholdCalendar,
  type FamilyState,
} from "@/app/actions/family";
import { Button, Field } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import {
  calendarEventDate,
  type HouseholdCalendar,
  type HouseholdCalendarEvent,
} from "@/lib/family";
import type { Locale } from "@/lib/household";

/* The calendars the household links for itself: the family Google calendar, a
   club's fixtures, a shared rota. The same arrangement as a school's feed on
   /family — we read it, we never write to it — and the same shape of panel,
   so linking one feels the same wherever you do it.

   A row shows what the last read found, or why it failed, which is the whole
   point of keeping the error rather than throwing it away. */

type Props = {
  calendars: HouseholdCalendar[];
  events: HouseholdCalendarEvent[];
  locale: Locale;
};

/** How many of a calendar's own dates are worth showing on the row. */
const PREVIEW_DATES = 3;

export default function SharedCalendarsPanel({
  calendars,
  events,
  locale,
}: Props) {
  const [adding, setAdding] = useState(false);
  const stopAdding = useCallback(() => setAdding(false), []);

  return (
    <div className="flex flex-col gap-4">
      {calendars.length === 0 ? (
        <p className="text-sm text-ink-faint">
          Nothing linked yet. Paste the “secret address in iCal format” from a
          Google calendar, or any calendar’s subscribe link, and its dates show
          up on this month alongside your own.
        </p>
      ) : (
        <ul className="divide-y divide-rule">
          {calendars.map((calendar) => (
            <CalendarRow
              key={calendar.id}
              calendar={calendar}
              dates={events
                .filter((event) => event.calendar_id === calendar.id)
                .slice(0, PREVIEW_DATES)}
              locale={locale}
            />
          ))}
        </ul>
      )}

      <div className="border-t border-rule pt-4">
        {adding ? (
          <CalendarForm onDone={stopAdding} />
        ) : (
          <Button type="button" variant="quiet" onClick={() => setAdding(true)}>
            Link a calendar
          </Button>
        )}
      </div>
    </div>
  );
}

function CalendarRow({
  calendar,
  dates,
  locale,
}: {
  calendar: HouseholdCalendar;
  dates: HouseholdCalendarEvent[];
  locale: Locale;
}) {
  const [editing, setEditing] = useState(false);
  const stopEditing = useCallback(() => setEditing(false), []);

  const [state, submit, pending] = useActionState<FamilyState, FormData>(
    refreshHouseholdCalendar,
    undefined
  );

  const trouble = state?.error ?? calendar.calendar_last_error;
  const syncedOn = calendar.calendar_last_synced_at?.slice(0, 10);
  const feedName = calendar.calendar_title?.trim();

  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">
            {calendar.name}
          </p>
          <p className="truncate text-xs text-ink-faint">
            {feedName && feedName !== calendar.name
              ? feedName
              : calendar.calendar_url
                ? "Linked calendar"
                : "No link yet"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing((open) => !open)}
          className="text-action shrink-0 text-sm"
        >
          {editing ? "Close" : "Edit"}
        </button>
      </div>

      {calendar.calendar_url ? (
        <div className="mt-2.5 rounded bg-paper-sunk px-3 py-2.5">
          <form
            action={submit}
            className="flex items-baseline justify-between gap-3"
          >
            <input type="hidden" name="calendar_id" value={calendar.id} />
            <p
              className={`tnum min-w-0 text-xs ${
                trouble ? "mark-fault" : "text-ink-faint"
              }`}
            >
              {trouble ??
                (syncedOn
                  ? `Last read ${formatDate(syncedOn, locale)}`
                  : "Not read yet")}
            </p>
            <button
              type="submit"
              disabled={pending}
              className="text-action shrink-0 text-xs"
            >
              {pending ? "Reading…" : "Refresh"}
            </button>
          </form>

          {dates.length > 0 ? (
            <ul className="mt-2 flex flex-col gap-1">
              {dates.map((event) => {
                const on = calendarEventDate(event.starts_at);
                return (
                  <li
                    key={event.id}
                    className="flex items-baseline justify-between gap-3 text-xs"
                  >
                    <span className="min-w-0 truncate text-ink">
                      {event.title}
                    </span>
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
      ) : null}

      {editing ? (
        <div className="mt-3 rounded-lg bg-paper-sunk p-3">
          <CalendarForm calendar={calendar} onDone={stopEditing} />
          <RemoveCalendar calendar={calendar} />
        </div>
      ) : null}
    </li>
  );
}

function CalendarForm({
  calendar,
  onDone,
}: {
  calendar?: HouseholdCalendar;
  onDone: () => void;
}) {
  const [state, submit, pending] = useActionState<FamilyState, FormData>(
    saveHouseholdCalendar,
    undefined
  );

  useEffect(() => {
    if (state?.ok) onDone();
  }, [state?.ok, onDone]);

  return (
    <form action={submit} className="flex flex-col gap-3">
      {calendar ? (
        <input type="hidden" name="calendar_id" value={calendar.id} />
      ) : null}

      <Field label="What to call it">
        <input
          name="name"
          type="text"
          required
          defaultValue={calendar?.name ?? ""}
          className="field-input"
          placeholder="Family calendar"
        />
      </Field>

      <Field
        label="Calendar link"
        hint="optional"
        note="The subscribe or iCal link — in Google Calendar it's the “secret address in iCal format” under the calendar's settings. We read it, we never write to it."
      >
        <input
          name="calendar_url"
          type="url"
          inputMode="url"
          defaultValue={calendar?.calendar_url ?? ""}
          className="field-input"
          placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
        />
      </Field>

      <Field label="What the feed calls itself" hint="optional">
        <input
          name="calendar_title"
          type="text"
          defaultValue={calendar?.calendar_title ?? ""}
          className="field-input"
          placeholder="Left blank, we use the feed's own name"
        />
      </Field>

      {state?.error ? <p className="text-sm mark-fault">{state.error}</p> : null}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : calendar ? "Save" : "Link it"}
        </Button>
        <button type="button" onClick={onDone} className="text-action text-sm">
          Cancel
        </button>
      </div>
    </form>
  );
}

function RemoveCalendar({ calendar }: { calendar: HouseholdCalendar }) {
  const [state, submit, pending] = useActionState<FamilyState, FormData>(
    deleteHouseholdCalendar,
    undefined
  );
  const [confirming, setConfirming] = useState(false);

  return (
    <form
      action={submit}
      className="mt-3 flex items-center justify-between gap-3 border-t border-rule pt-3"
    >
      <input type="hidden" name="calendar_id" value={calendar.id} />
      <p className={`text-xs ${state?.error ? "mark-fault" : "text-ink-faint"}`}>
        {state?.error ??
          (confirming
            ? "Unlink this calendar?"
            : "Only the copy we keep — the calendar itself is untouched.")}
      </p>
      {confirming ? (
        <button
          type="submit"
          disabled={pending}
          className="text-action mark-fault shrink-0 text-sm"
        >
          {pending ? "Unlinking…" : "Yes, unlink"}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="text-action shrink-0 text-sm"
        >
          Unlink
        </button>
      )}
    </form>
  );
}
