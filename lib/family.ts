// The household's people, their schools and the dates someone typed in.
// Client-safe: the shapes, the picklists, the loaders (which take a client)
// and the birthday arithmetic, so the /family panels and the dashboard share
// one definition of all of it.

import type { SupabaseClient } from "@supabase/supabase-js";

// --- people --------------------------------------------------------------

export const PERSON_KINDS = ["adult", "child", "other"] as const;

export type PersonKind = (typeof PERSON_KINDS)[number];

export const PERSON_KIND_LABEL: Record<PersonKind, string> = {
  adult: "Grown-up",
  child: "Child",
  other: "Someone else",
};

export function asPersonKind(value: unknown): PersonKind | null {
  return (PERSON_KINDS as readonly string[]).includes(value as string)
    ? (value as PersonKind)
    : null;
}

/** Someone who lives here. Most of them will never have an account. */
export type HouseholdPerson = {
  id: string;
  name: string;
  kind: PersonKind;
  birthday: string | null;
  school_id: string | null;
  year_group: string | null;
  notes: string | null;
  user_id: string | null;
  sort_order: number;
};

export const PEOPLE_SELECT =
  "id, name, kind, birthday, school_id, year_group, notes, user_id, sort_order";

/**
 * Everyone in the household, in the order they should be shown. A failure —
 * including the table not being deployed yet — reads as "nobody", so a page
 * never falls over on the family list.
 */
export async function loadHouseholdPeople(
  supabase: SupabaseClient,
  householdId: string
): Promise<HouseholdPerson[]> {
  const { data, error } = await supabase
    .from("household_people")
    .select(PEOPLE_SELECT)
    .eq("household_id", householdId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return [];
  return (data as HouseholdPerson[] | null) ?? [];
}

// --- schools -------------------------------------------------------------

export type School = {
  id: string;
  name: string;
  address: string | null;
  notes: string | null;
  /** The ICS feed, if the school publishes one. */
  calendar_url: string | null;
  calendar_title: string | null;
  calendar_last_synced_at: string | null;
  calendar_last_error: string | null;
};

// One literal string: the client parses it to type the row, so it can't be
// assembled from pieces.
export const SCHOOLS_SELECT =
  "id, name, address, notes, calendar_url, calendar_title, calendar_last_synced_at, calendar_last_error";

export async function loadSchools(
  supabase: SupabaseClient,
  householdId: string
): Promise<School[]> {
  const { data, error } = await supabase
    .from("schools")
    .select(SCHOOLS_SELECT)
    .eq("household_id", householdId)
    .order("created_at", { ascending: true });
  if (error) return [];
  return (data as School[] | null) ?? [];
}

// --- school calendars ----------------------------------------------------

/**
 * How far ahead a school's feed is read, and read back. The sync caches this
 * far and no further, so the loader asking for more would only ever get the
 * same rows.
 */
export const SCHOOL_CALENDAR_WINDOW_DAYS = 120;

/** More than any school prints in four months, and enough to never truncate one. */
const SCHOOL_CALENDAR_ROW_CAP = 500;

/** A cached occurrence from a school's ICS feed. Never typed in by hand. */
export type SchoolCalendarEvent = {
  id: string;
  school_id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  location: string | null;
};

export const SCHOOL_CALENDAR_SELECT =
  "id, school_id, title, starts_at, ends_at, all_day, location";

/**
 * The calendar date an occurrence falls on, as YYYY-MM-DD. All-day rows are
 * stored at UTC midnight, so this is exact for them; a timed row is read in
 * UTC, which is the same day for anything that isn't late in the evening.
 */
export function calendarEventDate(startsAt: string): string | null {
  const at = new Date(startsAt);
  return Number.isNaN(at.getTime()) ? null : at.toISOString().slice(0, 10);
}

/**
 * Every cached school date from today to the end of the window, soonest
 * first. A failure — including the table not being deployed yet — reads as
 * "no school dates", so no page falls over on a calendar.
 */
export async function loadSchoolCalendarEvents(
  supabase: SupabaseClient,
  householdId: string,
  { now = new Date(), withinDays = SCHOOL_CALENDAR_WINDOW_DAYS } = {}
): Promise<SchoolCalendarEvent[]> {
  const from = startOfUtcDay(now);
  const { data, error } = await supabase
    .from("school_calendar_events")
    .select(SCHOOL_CALENDAR_SELECT)
    .eq("household_id", householdId)
    .gte("starts_at", new Date(from).toISOString())
    .lte("starts_at", new Date(from + withinDays * DAY_MS).toISOString())
    .order("starts_at", { ascending: true })
    .limit(SCHOOL_CALENDAR_ROW_CAP);
  if (error) return [];
  return (data as SchoolCalendarEvent[] | null) ?? [];
}

// --- key dates -----------------------------------------------------------

export const EVENT_TYPES = ["birthday", "school", "home", "other"] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_TYPE_LABEL: Record<EventType, string> = {
  birthday: "Birthday",
  school: "School",
  home: "The house",
  other: "Something else",
};

export function asEventType(value: unknown): EventType | null {
  return (EVENT_TYPES as readonly string[]).includes(value as string)
    ? (value as EventType)
    : null;
}

/**
 * A date somebody typed in: a term start, the boiler service, a wedding.
 * Birthdays are not kept in here — they are derived from a person's
 * `birthday`, so there is only ever one copy of one.
 */
export type HouseholdEvent = {
  id: string;
  title: string;
  event_date: string;
  event_type: EventType;
  person_id: string | null;
  school_id: string | null;
  notes: string | null;
};

export const EVENTS_SELECT =
  "id, title, event_date, event_type, person_id, school_id, notes";

export async function loadHouseholdEvents(
  supabase: SupabaseClient,
  householdId: string
): Promise<HouseholdEvent[]> {
  const { data, error } = await supabase
    .from("household_events")
    .select(EVENTS_SELECT)
    .eq("household_id", householdId)
    .order("event_date", { ascending: true });
  if (error) return [];
  return (data as HouseholdEvent[] | null) ?? [];
}

// --- dates ---------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

type DateParts = { year: number; month: number; day: number };

/** A stored YYYY-MM-DD value, split up. Null if it isn't one. */
export function parseDateParts(value: string | null): DateParts | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return null;
  const parts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
  return parts.month >= 1 && parts.month <= 12 && parts.day >= 1 && parts.day <= 31
    ? parts
    : null;
}

export function startOfUtcDay(now: Date): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

/** Whole days from today to a stored date. Negative once it is behind us. */
export function daysUntil(date: string | null, now: Date = new Date()): number | null {
  const parts = parseDateParts(date);
  if (!parts) return null;
  const at = Date.UTC(parts.year, parts.month - 1, parts.day);
  return Math.round((at - startOfUtcDay(now)) / DAY_MS);
}

export type BirthdayInfo = {
  /** The next one to come round, as YYYY-MM-DD. */
  date: string;
  daysAway: number;
  /** The age reached on that date. */
  turning: number;
};

/**
 * The next time a birthday comes round. A 29 February birthday lands on
 * 1 March in the years that don't have one, which is how Date.UTC rolls it.
 */
export function nextBirthday(
  birthday: string | null,
  now: Date = new Date()
): BirthdayInfo | null {
  const parts = parseDateParts(birthday);
  if (!parts) return null;

  const today = startOfUtcDay(now);
  const thisYear = new Date(today).getUTCFullYear();

  let at = Date.UTC(thisYear, parts.month - 1, parts.day);
  if (at < today) at = Date.UTC(thisYear + 1, parts.month - 1, parts.day);

  const occurrence = new Date(at);
  return {
    date: occurrence.toISOString().slice(0, 10),
    daysAway: Math.round((at - today) / DAY_MS),
    turning: occurrence.getUTCFullYear() - parts.year,
  };
}
