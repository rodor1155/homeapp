import "server-only";

import {
  calendarEventDate,
  daysUntil,
  EVENT_TYPE_LABEL,
  nextBirthday,
  type HouseholdEvent,
  type HouseholdPerson,
  type School,
  type SchoolCalendarEvent,
} from "@/lib/family";
import type { UpcomingDate } from "@/lib/home-overview";

/* One list for everything with a date on it: renewals read off documents,
   birthdays derived from the household's people, the dates someone typed in
   by hand, and what the schools' own calendars say. Pure shaping — the caller
   loads the rows. */

export type ComingUpKind = "document" | "birthday" | "event" | "school";

export type ComingUpEntry = {
  key: string;
  kind: ComingUpKind;
  title: string;
  /** The quiet second line: what kind of date this is. */
  note: string;
  date: string;
  daysAway: number;
};

/** How far ahead a birthday is worth mentioning. */
export const BIRTHDAY_HORIZON_DAYS = 60;

/**
 * A school calendar is long and busy, so the dashboard only takes the next
 * few weeks of it, and only so many rows — the whole four-month window is on
 * /family, under the school it came from.
 */
export const SCHOOL_HORIZON_DAYS = 45;
export const SCHOOL_ENTRY_LIMIT = 8;

export function documentEntries(
  dates: readonly UpcomingDate[],
  isReminded: (entry: UpcomingDate) => boolean = () => false
): ComingUpEntry[] {
  return dates.map((entry, i) => ({
    key: `document-${entry.date}-${entry.label}-${i}`,
    kind: "document" as const,
    title: entry.provider,
    note: isReminded(entry) ? `${entry.label} · reminders on` : entry.label,
    date: entry.date,
    daysAway: entry.daysAway,
  }));
}

/** Birthdays coming round inside the horizon, derived — never stored twice. */
export function birthdayEntries(
  people: readonly HouseholdPerson[],
  now: Date = new Date(),
  withinDays: number = BIRTHDAY_HORIZON_DAYS
): ComingUpEntry[] {
  const entries: ComingUpEntry[] = [];

  for (const person of people) {
    const next = nextBirthday(person.birthday, now);
    if (!next || next.daysAway > withinDays) continue;
    entries.push({
      key: `birthday-${person.id}`,
      kind: "birthday",
      title: `${person.name}’s birthday`,
      note: `Turns ${next.turning}`,
      date: next.date,
      daysAway: next.daysAway,
    });
  }

  return entries;
}

/** Every typed-in date still ahead of us. */
export function eventEntries(
  events: readonly HouseholdEvent[],
  people: readonly HouseholdPerson[] = [],
  now: Date = new Date()
): ComingUpEntry[] {
  const nameById = new Map(people.map((person) => [person.id, person.name]));
  const entries: ComingUpEntry[] = [];

  for (const event of events) {
    const daysAway = daysUntil(event.event_date, now);
    if (daysAway === null || daysAway < 0) continue;

    const who = event.person_id ? nameById.get(event.person_id) : null;
    entries.push({
      key: `event-${event.id}`,
      kind: "event",
      title: event.title,
      note: [EVENT_TYPE_LABEL[event.event_type], who].filter(Boolean).join(" · "),
      date: event.event_date,
      daysAway,
    });
  }

  return entries;
}

/**
 * What the schools' own calendars say, inside the dashboard's shorter
 * horizon. The note names the school, so a household with two of them can
 * tell whose inset day it is.
 */
export function schoolEntries(
  events: readonly SchoolCalendarEvent[],
  schools: readonly School[] = [],
  now: Date = new Date(),
  withinDays: number = SCHOOL_HORIZON_DAYS,
  limit: number = SCHOOL_ENTRY_LIMIT
): ComingUpEntry[] {
  const labelById = new Map(
    schools.map((school) => [school.id, school.calendar_title?.trim() || school.name])
  );
  const entries: ComingUpEntry[] = [];

  for (const event of events) {
    const date = calendarEventDate(event.starts_at);
    if (!date) continue;
    const daysAway = daysUntil(date, now);
    if (daysAway === null || daysAway < 0 || daysAway > withinDays) continue;

    entries.push({
      key: `school-${event.id}`,
      kind: "school",
      title: event.title,
      note: labelById.get(event.school_id) ?? "School calendar",
      date,
      daysAway,
    });
    if (entries.length >= limit) break;
  }

  return entries;
}

/** Soonest first, then alphabetically so the order never wobbles. */
export function mergeComingUp(
  ...lists: readonly ComingUpEntry[][]
): ComingUpEntry[] {
  return lists
    .flat()
    .sort(
      (a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title)
    );
}
