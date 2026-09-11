"use client";

import { useActionState, useCallback, useState } from "react";
import { deleteEvent, type FamilyState } from "@/app/actions/family";
import EventForm from "@/components/EventForm";
import { Button } from "@/components/ui";
import { formatDate, relativeWhen } from "@/lib/dates";
import {
  daysUntil,
  EVENT_TYPE_LABEL,
  type HouseholdEvent,
  type HouseholdPerson,
} from "@/lib/family";
import type { Locale } from "@/lib/household";

type Props = {
  events: HouseholdEvent[];
  people: HouseholdPerson[];
  locale: Locale;
};

export default function EventsPanel({ events, people, locale }: Props) {
  const [adding, setAdding] = useState(false);
  const [showingPast, setShowingPast] = useState(false);
  const stopAdding = useCallback(() => setAdding(false), []);

  const ahead: HouseholdEvent[] = [];
  const behind: HouseholdEvent[] = [];
  for (const event of events) {
    const away = daysUntil(event.event_date);
    if (away !== null && away < 0) behind.push(event);
    else ahead.push(event);
  }

  return (
    <div className="flex flex-col gap-4">
      {ahead.length === 0 ? (
        <p className="text-sm text-ink-faint">
          Nothing coming up. Term dates, the boiler service, a wedding — put
          them here and they show on your home screen.
        </p>
      ) : (
        <ul className="divide-y divide-rule">
          {ahead.map((event) => (
            <EventRow
              key={event.id}
              event={event}
              people={people}
              locale={locale}
            />
          ))}
        </ul>
      )}

      {behind.length > 0 ? (
        showingPast ? (
          <div className="border-t border-rule pt-3">
            <p className="mb-1 text-xs font-medium text-ink-faint">
              Already been
            </p>
            <ul className="divide-y divide-rule">
              {[...behind].reverse().map((event) => (
                <EventRow
                  key={event.id}
                  event={event}
                  people={people}
                  locale={locale}
                  past
                />
              ))}
            </ul>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowingPast(true)}
            className="text-action self-start text-sm"
          >
            Show {behind.length} {behind.length === 1 ? "date" : "dates"} that
            have been
          </button>
        )
      ) : null}

      <div className="border-t border-rule pt-4">
        {adding ? (
          <EventForm people={people} onDone={stopAdding} />
        ) : (
          <Button type="button" variant="quiet" onClick={() => setAdding(true)}>
            Add a date
          </Button>
        )}
      </div>
    </div>
  );
}

function EventRow({
  event,
  people,
  locale,
  past = false,
}: {
  event: HouseholdEvent;
  people: HouseholdPerson[];
  locale: Locale;
  past?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const stopEditing = useCallback(() => setEditing(false), []);

  const away = daysUntil(event.event_date);
  const who = people.find((person) => person.id === event.person_id) ?? null;
  const meta = [EVENT_TYPE_LABEL[event.event_type], who?.name]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className={`truncate text-sm font-medium ${
              past ? "text-ink-faint" : "text-ink"
            }`}
          >
            {event.title}
          </p>
          <p className="truncate text-xs text-ink-faint">{meta}</p>
        </div>
        <div className="flex shrink-0 items-start gap-3">
          <span className="tnum text-right">
            <span className="block text-sm text-ink">
              {formatDate(event.event_date, locale)}
            </span>
            {!past && away !== null ? (
              <span
                className={`block text-xs ${
                  away <= 30 ? "mark-review font-medium" : "text-ink-faint"
                }`}
              >
                {relativeWhen(away)}
              </span>
            ) : null}
          </span>
          <button
            type="button"
            onClick={() => setEditing((open) => !open)}
            className="text-action text-sm"
          >
            {editing ? "Close" : "Edit"}
          </button>
        </div>
      </div>

      {editing ? (
        <div className="mt-3 rounded-lg bg-paper-sunk p-3">
          <EventForm event={event} people={people} onDone={stopEditing} />
          <RemoveEvent event={event} />
        </div>
      ) : null}
    </li>
  );
}

function RemoveEvent({ event }: { event: HouseholdEvent }) {
  const [state, submit, pending] = useActionState<FamilyState, FormData>(
    deleteEvent,
    undefined
  );
  const [confirming, setConfirming] = useState(false);

  return (
    <form
      action={submit}
      className="mt-3 flex items-center justify-between gap-3 border-t border-rule pt-3"
    >
      <input type="hidden" name="event_id" value={event.id} />
      <p className={`text-xs ${state?.error ? "mark-fault" : "text-ink-faint"}`}>
        {state?.error ?? (confirming ? "Delete this date?" : "This can’t be undone.")}
      </p>
      {confirming ? (
        <button
          type="submit"
          disabled={pending}
          className="text-action mark-fault shrink-0 text-sm"
        >
          {pending ? "Deleting…" : "Yes, delete"}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="text-action shrink-0 text-sm"
        >
          Delete
        </button>
      )}
    </form>
  );
}
