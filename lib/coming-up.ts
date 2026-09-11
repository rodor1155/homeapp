import "server-only";

import {
  calendarEventDate,
  daysUntil,
  EVENT_TYPE_LABEL,
  nextBirthday,
  type HouseholdCalendar,
  type HouseholdCalendarEvent,
  type HouseholdEvent,
  type HouseholdPerson,
  type School,
  type SchoolCalendarEvent,
} from "@/lib/family";
import type { UpcomingDate } from "@/lib/home-overview";
import type { Tone } from "@/lib/tones";

/* One list for everything with a date on it: renewals read off documents,
   birthdays derived from the household's people, the dates someone typed in
   by hand, what the schools' own calendars say and what the household's own
   linked feeds do. Pure shaping — the caller loads the rows. */

export type ComingUpKind =
  | "document"
  | "birthday"
  | "event"
  | "school"
  | "shared";

/**
 * The colour each kind wears in the list. The same assignment the calendar
 * uses (lib/calendar-month.ts), plus the neutral navy for a document — a
 * renewal is paperwork, not somewhere to be.
 */
export const COMING_UP_TONE: Record<ComingUpKind, Tone> = {
  document: "navy",
  birthday: "sage",
  event: "lilac",
  school: "peach",
  shared: "sky",
};

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

/**
 * A household's own shared feed is the busiest thing here — a family Google
 * calendar has something on most days — so it gets a shorter horizon and a
 * tighter cap than the schools. The whole window is on /calendar.
 */
export const SHARED_HORIZON_DAYS = 21;
export const SHARED_ENTRY_LIMIT = 6;

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

/**
 * What the household's own linked calendars say, inside the shortest horizon
 * of the lot. The note names the calendar, so a family diary and a fixtures
 * feed don't read as the same thing.
 */
export function sharedEntries(
  events: readonly HouseholdCalendarEvent[],
  calendars: readonly HouseholdCalendar[] = [],
  now: Date = new Date(),
  withinDays: number = SHARED_HORIZON_DAYS,
  limit: number = SHARED_ENTRY_LIMIT
): ComingUpEntry[] {
  const labelById = new Map(
    calendars.map((calendar) => [
      calendar.id,
      calendar.name.trim() || calendar.calendar_title?.trim() || "Shared calendar",
    ])
  );
  const entries: ComingUpEntry[] = [];

  for (const event of events) {
    const date = calendarEventDate(event.starts_at);
    if (!date) continue;
    const daysAway = daysUntil(date, now);
    if (daysAway === null || daysAway < 0 || daysAway > withinDays) continue;

    entries.push({
      key: `shared-${event.id}`,
      kind: "shared",
      title: event.title,
      note: labelById.get(event.calendar_id) ?? "Shared calendar",
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

/** One month's worth of the list. `key` is the YYYY-MM the caller writes out. */
export type ComingUpMonth = {
  key: string;
  entries: ComingUpEntry[];
};

/**
 * The merged list broken at each change of month, so a long horizon reads as
 * "October, then December" rather than one unbroken run. Relies on the list
 * already being in date order, which is what `mergeComingUp` leaves it in.
 */
export function groupByMonth(
  entries: readonly ComingUpEntry[]
): ComingUpMonth[] {
  const months: ComingUpMonth[] = [];

  for (const entry of entries) {
    const key = entry.date.slice(0, 7);
    const open = months[months.length - 1];
    if (open?.key === key) open.entries.push(entry);
    else months.push({ key, entries: [entry] });
  }

  return months;
}
