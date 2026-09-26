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
import {
  childYearsForSchool,
  eventRelevantToYears,
  householdChildYears,
} from "@/lib/school-year-match";
import type { Tone } from "@/lib/tones";
import type { HouseholdRoutine } from "@/lib/routines";
import { routineComingUpEntries } from "@/lib/routines";
import type { PersonTimetableSlot } from "@/lib/timetable";
import { timetableComingUpEntries, weekdayForDate } from "@/lib/timetable";
import {
  renewalStatusLabel,
  renewalWindow,
  type RenewalItem,
} from "@/lib/renewals";

/* One list for everything with a date on it: document renewals, tracked renewal
   items, birthdays derived from the household's people, the dates someone typed in
   by hand, what the schools' own calendars say and what the household's own
   linked feeds do. Pure shaping — the caller loads the rows. */

export type ComingUpKind =
  | "document"
  | "renewal"
  | "birthday"
  | "event"
  | "school"
  | "shared"
  | "timetable"
  | "routine";

/**
 * The colour each kind wears in the list. The same assignment the calendar
 * uses (lib/calendar-month.ts), plus the neutral navy for a document — a
 * renewal is paperwork, not somewhere to be.
 */
export const COMING_UP_TONE: Record<ComingUpKind, Tone> = {
  document: "navy",
  renewal: "ochre",
  birthday: "sage",
  event: "navy",
  school: "sage",
  shared: "navy",
  timetable: "ochre",
  routine: "sage",
};

export type ComingUpEntry = {
  key: string;
  kind: ComingUpKind;
  title: string;
  /** The quiet second line: what kind of date this is. */
  note: string;
  date: string;
  daysAway: number;
  /** Primary row id — event, school/shared feed row, document, routine. */
  recordId?: string;
  /** When the row belongs to one household person (birthday, event, timetable). */
  personId?: string | null;
  /** Timetable slot when the row is a lesson / kit cue. */
  slotId?: string;
  /** London weekday 0=Mon … 6=Sun for timetable deep links. */
  weekday?: number;
  /** Tracked renewal rows — link target on /family. */
  renewalId?: string;
  /** Reference number for renewal detail (CopyButton). */
  renewalReference?: string | null;
  /** Overdue renewals sort first and read as "today" on the evening map. */
  overdue?: boolean;
  /** ICS school / shared feeds — enough to open the same detail sheet. */
  allDay?: boolean;
  startsAt?: string;
  endsAt?: string | null;
  location?: string | null;
  description?: string | null;
  url?: string | null;
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

/** Calendar deep-link token: `event`, `school`, or `shared`, plus row id. */
export type CalendarEventRef = {
  kind: "event" | "school" | "shared";
  id: string;
};

const CALENDAR_EVENT_REF = /^(event|school|shared):([0-9a-f-]{36})$/i;

/** Parse `?event=school:<uuid>` from the calendar URL. */
export function parseCalendarEventRef(
  value: string | null | undefined
): CalendarEventRef | null {
  const match = CALENDAR_EVENT_REF.exec((value ?? "").trim());
  if (!match) return null;
  return { kind: match[1]!.toLowerCase() as CalendarEventRef["kind"], id: match[2]! };
}

/** The calendar item key for a coming-up / deep-link ref. */
export function calendarItemKey(ref: CalendarEventRef): string {
  return `${ref.kind}-${ref.id}`;
}

/**
 * Where a Coming up row should land. Returns null when the entry lacks the
 * ids needed — callers treat that as non-navigable.
 */
export function comingUpHref(entry: ComingUpEntry): string | null {
  switch (entry.kind) {
    case "event":
    case "school":
    case "shared": {
      if (!entry.recordId) return null;
      const ym = entry.date.slice(0, 7);
      return `/calendar?ym=${ym}&date=${entry.date}&event=${entry.kind}:${entry.recordId}`;
    }
    case "renewal":
      return entry.renewalId
        ? `/family?renewal=${entry.renewalId}#renewals`
        : null;
    case "document":
      return entry.recordId ? `/documents?doc=${entry.recordId}` : null;
    case "birthday":
      return entry.personId ? `/family?person=${entry.personId}` : null;
    case "routine":
      return entry.recordId
        ? `/family?routine=${entry.recordId}#routines`
        : null;
    case "timetable":
      if (!entry.personId || entry.weekday == null) return null;
      return `/family?timetable=${entry.personId}&weekday=${entry.weekday}#timetable`;
    default:
      return null;
  }
}

export function documentEntries(
  dates: readonly UpcomingDate[],
  isReminded: (entry: UpcomingDate) => boolean = () => false
): ComingUpEntry[] {
  return dates.map((entry, i) => ({
    key: `document-${entry.documentId}-${entry.date}-${entry.label}-${i}`,
    kind: "document" as const,
    title: entry.provider,
    note: isReminded(entry) ? `${entry.label} · reminders on` : entry.label,
    date: entry.date,
    daysAway: entry.daysAway,
    recordId: entry.documentId,
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
      personId: person.id,
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
      personId: event.person_id,
      recordId: event.id,
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
  people: readonly HouseholdPerson[] = [],
  now: Date = new Date(),
  withinDays: number = SCHOOL_HORIZON_DAYS,
  limit: number = SCHOOL_ENTRY_LIMIT
): ComingUpEntry[] {
  const labelById = new Map(
    schools.map((school) => [school.id, school.calendar_title?.trim() || school.name])
  );
  const householdYears = householdChildYears(people);
  const yearsBySchool = new Map<string, Set<string>>();
  const entries: ComingUpEntry[] = [];

  for (const event of events) {
    const date = calendarEventDate(event.starts_at);
    if (!date) continue;
    const daysAway = daysUntil(date, now);
    if (daysAway === null || daysAway < 0 || daysAway > withinDays) continue;

    if (householdYears.size > 0) {
      let years = yearsBySchool.get(event.school_id);
      if (!years) {
        years = childYearsForSchool(people, event.school_id);
        yearsBySchool.set(event.school_id, years);
      }
      if (!eventRelevantToYears(event.title, years)) continue;
    }

    entries.push({
      key: `school-${event.id}`,
      kind: "school",
      title: event.title,
      note: labelById.get(event.school_id) ?? "School calendar",
      date,
      daysAway,
      recordId: event.id,
      allDay: event.all_day,
      startsAt: event.starts_at,
      endsAt: event.ends_at,
      location: event.location,
      description: event.description,
      url: event.url,
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
      recordId: event.id,
      allDay: event.all_day,
      startsAt: event.starts_at,
      endsAt: event.ends_at,
      location: event.location,
      description: event.description,
      url: event.url,
    });
    if (entries.length >= limit) break;
  }

  return entries;
}

/**
 * Kit / ingredients cues (and plain lessons on the day) from each child's
 * confirmed week. Europe/London day arithmetic lives in lib/timetable.
 */
export function routineEntries(
  routines: readonly HouseholdRoutine[],
  now: Date = new Date()
): ComingUpEntry[] {
  return routineComingUpEntries(routines, now).map((entry) => ({
    key: entry.key,
    kind: "routine" as const,
    title: entry.title,
    note: entry.note,
    date: entry.date,
    daysAway: entry.daysAway,
    recordId: entry.routineId,
  }));
}

export function timetableEntries(
  slots: readonly PersonTimetableSlot[],
  people: readonly HouseholdPerson[],
  now: Date = new Date()
): ComingUpEntry[] {
  return timetableComingUpEntries(slots, people, now).map((entry) => ({
    key: entry.key,
    kind: "timetable" as const,
    title: entry.title,
    note: entry.note,
    date: entry.date,
    daysAway: entry.daysAway,
    personId: entry.personId,
    slotId: entry.slotId,
    weekday: weekdayForDate(entry.date) ?? undefined,
  }));
}

/** Active renewal items inside their remind window or overdue. */
export function renewalEntries(
  items: readonly RenewalItem[],
  now: Date = new Date()
): ComingUpEntry[] {
  const entries: ComingUpEntry[] = [];

  for (const item of items) {
    if (item.status !== "active" || !item.due_date) continue;
    const window = renewalWindow(item, now);
    if (!window?.inWindow) continue;

    const status = renewalStatusLabel(item, now);
    const note = [status, item.provider].filter(Boolean).join(" · ");
    const overdue = window.overdue;
    const daysAway = overdue ? 0 : window.daysAway;

    entries.push({
      key: `renewal-${item.id}`,
      kind: "renewal",
      title: item.title,
      note,
      date: item.due_date,
      daysAway,
      personId: item.person_id,
      renewalId: item.id,
      renewalReference: item.reference,
      overdue,
    });
  }

  return entries;
}

/** Soonest first; overdue renewals before everything else. */
export function mergeComingUp(
  ...lists: readonly ComingUpEntry[][]
): ComingUpEntry[] {
  return lists
    .flat()
    .sort((a, b) => {
      const aOver = a.overdue ? 0 : 1;
      const bOver = b.overdue ? 0 : 1;
      if (aOver !== bOver) return aOver - bOver;
      return a.date.localeCompare(b.date) || a.title.localeCompare(b.title);
    });
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
