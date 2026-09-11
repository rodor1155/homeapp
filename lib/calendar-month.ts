// The family calendar, a month at a time: which squares the month has, and
// what falls on them. Client-safe and pure — the page loads the rows, this
// decides where they land.

import {
  calendarDayParts,
  calendarEventDate,
  EVENT_TYPE_LABEL,
  parseDateParts,
  type HouseholdCalendar,
  type HouseholdCalendarEvent,
  type HouseholdEvent,
  type HouseholdPerson,
  type School,
  type SchoolCalendarEvent,
} from "@/lib/family";
import {
  childYearsForSchool,
  eventRelevantToYears,
  householdChildYears,
} from "@/lib/school-year-match";
import type { Tone } from "@/lib/tones";
import {
  timetableCalendarItems,
  type PersonTimetableSlot,
} from "@/lib/timetable";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Far enough either way that the arrows never need a stop. */
const MIN_YEAR = 1970;
const MAX_YEAR = 2999;

/** A month as the URL carries it. `month` is 1–12, not a Date's 0–11. */
export type MonthKey = { year: number; month: number };

export type CalendarKind = "birthday" | "event" | "school" | "shared" | "timetable";

/** The order the legend reads and the dots sit in on a day. */
export const CALENDAR_KINDS: readonly CalendarKind[] = [
  "birthday",
  "event",
  "school",
  "shared",
  "timetable",
];

export const CALENDAR_KIND_LABEL: Record<CalendarKind, string> = {
  birthday: "Birthdays",
  event: "Key dates",
  school: "School",
  shared: "Shared",
  timetable: "Lessons",
};

/**
 * Which colour each kind wears, here rather than on the page so the month
 * grid, the list under it and the dashboard's "Coming up" agree. Birthdays
 * keep the house green; the three feeds and typed-in dates take a pastel each.
 */
export const CALENDAR_KIND_TONE: Record<CalendarKind, Tone> = {
  birthday: "sage",
  event: "lilac",
  school: "peach",
  shared: "sky",
  timetable: "ochre",
};

/** One thing on one day. Documents are deliberately not in here — a renewal
 *  is a reminder, not somewhere the household has to be. */
export type CalendarItem = {
  key: string;
  kind: CalendarKind;
  /** YYYY-MM-DD. */
  date: string;
  title: string;
  note: string;
};

/** A square in the grid. The leading and trailing ones belong to the months
 *  either side, and are shown greyed rather than left blank. */
export type CalendarDay = {
  date: string;
  day: number;
  inMonth: boolean;
};

export function currentMonth(now: Date = new Date()): MonthKey {
  const parts = calendarDayParts(now);
  return { year: parts.year, month: parts.month };
}

/** A `?ym=2026-10` value, or this month if it is missing or nonsense. */
export function parseMonthKey(
  value: string | null,
  now: Date = new Date()
): MonthKey {
  const match = /^(\d{4})-(\d{2})$/.exec((value ?? "").trim());
  if (!match) return currentMonth(now);

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12 || year < MIN_YEAR || year > MAX_YEAR) {
    return currentMonth(now);
  }
  return { year, month };
}

export function monthParam(key: MonthKey): string {
  return `${key.year}-${String(key.month).padStart(2, "0")}`;
}

/** The month `delta` months either side, rolling the year over as it goes. */
export function shiftMonth(key: MonthKey, delta: number): MonthKey {
  const at = new Date(Date.UTC(key.year, key.month - 1 + delta, 1));
  return { year: at.getUTCFullYear(), month: at.getUTCMonth() + 1 };
}

export function sameMonth(a: MonthKey, b: MonthKey): boolean {
  return a.year === b.year && a.month === b.month;
}

export function daysInMonth(key: MonthKey): number {
  return new Date(Date.UTC(key.year, key.month, 0)).getUTCDate();
}

/** The first and last day of the month, as stored dates. */
export function monthBounds(key: MonthKey): { from: string; to: string } {
  const prefix = monthParam(key);
  return {
    from: `${prefix}-01`,
    to: `${prefix}-${String(daysInMonth(key)).padStart(2, "0")}`,
  };
}

/**
 * Every square of the grid, in whole weeks. `weekStartsOn` is 1 for a Monday
 * (the UK) and 0 for a Sunday (the US); the row of weekday names above the
 * grid is built from the same number.
 */
export function monthDays(key: MonthKey, weekStartsOn: 0 | 1): CalendarDay[] {
  const first = Date.UTC(key.year, key.month - 1, 1);
  const lead = (new Date(first).getUTCDay() - weekStartsOn + 7) % 7;
  const squares = Math.ceil((lead + daysInMonth(key)) / 7) * 7;

  const days: CalendarDay[] = [];
  for (let i = 0; i < squares; i += 1) {
    const at = new Date(first - lead * DAY_MS + i * DAY_MS);
    days.push({
      date: isoDate(at),
      day: at.getUTCDate(),
      inMonth: at.getUTCMonth() === key.month - 1,
    });
  }
  return days;
}

/**
 * The birthdays that come round in this month. Derived from the people, the
 * way they are everywhere else — a 29 February birthday rolls to 1 March in
 * the years without one, so it shows up in March's grid, not February's.
 */
export function birthdayItems(
  people: readonly HouseholdPerson[],
  key: MonthKey
): CalendarItem[] {
  const prefix = monthParam(key);
  const items: CalendarItem[] = [];

  for (const person of people) {
    const parts = parseDateParts(person.birthday);
    if (!parts || key.year < parts.year) continue;

    const date = isoDate(new Date(Date.UTC(key.year, parts.month - 1, parts.day)));
    if (!date.startsWith(prefix)) continue;

    items.push({
      key: `birthday-${person.id}`,
      kind: "birthday",
      date,
      title: `${person.name}’s birthday`,
      note: `Turns ${key.year - parts.year}`,
    });
  }

  return items;
}

/** The dates somebody typed in that fall in this month. */
export function eventItems(
  events: readonly HouseholdEvent[],
  people: readonly HouseholdPerson[],
  key: MonthKey
): CalendarItem[] {
  const prefix = monthParam(key);
  const nameById = new Map(people.map((person) => [person.id, person.name]));

  return events
    .filter((event) => event.event_date.startsWith(prefix))
    .map((event) => ({
      key: `event-${event.id}`,
      kind: "event" as const,
      date: event.event_date.slice(0, 10),
      title: event.title,
      note: [
        EVENT_TYPE_LABEL[event.event_type],
        event.person_id ? nameById.get(event.person_id) : null,
      ]
        .filter(Boolean)
        .join(" · "),
    }));
}

/** What the schools' own feeds say about this month, filtered to the years
 *  the household's children are in (plus whole-school, untagged dates). */
export function schoolItems(
  calendarEvents: readonly SchoolCalendarEvent[],
  schools: readonly School[],
  key: MonthKey,
  people: readonly HouseholdPerson[] = []
): CalendarItem[] {
  const prefix = monthParam(key);
  const labelById = new Map(
    schools.map((school) => [school.id, school.calendar_title?.trim() || school.name])
  );
  const householdYears = householdChildYears(people);
  const yearsBySchool = new Map<string, Set<string>>();
  const items: CalendarItem[] = [];

  for (const event of calendarEvents) {
    const date = calendarEventDate(event.starts_at);
    if (!date || !date.startsWith(prefix)) continue;

    // No child year_group anywhere → leave the feed alone.
    if (householdYears.size > 0) {
      let years = yearsBySchool.get(event.school_id);
      if (!years) {
        years = childYearsForSchool(people, event.school_id);
        yearsBySchool.set(event.school_id, years);
      }
      if (!eventRelevantToYears(event.title, years)) continue;
    }

    items.push({
      key: `school-${event.id}`,
      kind: "school",
      title: event.title,
      note: labelById.get(event.school_id) ?? "School calendar",
      date,
    });
  }

  return items;
}

/** What the household's own linked feeds say about this month. */
export function sharedItems(
  calendarEvents: readonly HouseholdCalendarEvent[],
  calendars: readonly HouseholdCalendar[],
  key: MonthKey
): CalendarItem[] {
  const prefix = monthParam(key);
  const labelById = new Map(
    calendars.map((calendar) => [
      calendar.id,
      calendar.name.trim() || calendar.calendar_title?.trim() || "Shared calendar",
    ])
  );
  const items: CalendarItem[] = [];

  for (const event of calendarEvents) {
    const date = calendarEventDate(event.starts_at);
    if (!date || !date.startsWith(prefix)) continue;

    items.push({
      key: `shared-${event.id}`,
      kind: "shared",
      title: event.title,
      note: labelById.get(event.calendar_id) ?? "Shared calendar",
      date,
    });
  }

  return items;
}

/** Everything in the month, in the order the list under the grid reads. */
export function sortItems(items: readonly CalendarItem[]): CalendarItem[] {
  return [...items].sort(
    (a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title)
  );
}

/** The same items keyed by day, which is what a square asks for. */
export function itemsByDate(
  items: readonly CalendarItem[]
): Map<string, CalendarItem[]> {
  const byDate = new Map<string, CalendarItem[]>();
  for (const item of items) {
    const day = byDate.get(item.date);
    if (day) day.push(item);
    else byDate.set(item.date, [item]);
  }
  return byDate;
}

function isoDate(at: Date): string {
  return at.toISOString().slice(0, 10);
}


/** Lessons from each child's confirmed weekly timetable in this month. */
export function timetableItems(
  slots: readonly PersonTimetableSlot[],
  people: readonly HouseholdPerson[],
  key: MonthKey
): CalendarItem[] {
  const { from, to } = monthBounds(key);
  return timetableCalendarItems(slots, people, from, to).map((item) => ({
    key: item.key,
    kind: "timetable" as const,
    date: item.date,
    title: item.title,
    note: item.note,
  }));
}
