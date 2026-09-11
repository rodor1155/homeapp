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

/**
 * How this person is related to the household — "wife", "daughter". Separate
 * from `kind`, which is only the three buckets the app reasons about (a
 * grown-up, a child, someone else): the relation is what the household would
 * actually call them, and nothing branches on it.
 *
 * Deliberately flat. A daughter is a daughter *of the household*, not of a
 * named parent, so there is no parent/child graph here — see the note in
 * CLAUDE.md about promoting this to `person_relationships` if one is ever
 * needed.
 */
export const PERSON_RELATIONS = [
  "wife",
  "husband",
  "partner",
  "mother",
  "father",
  "daughter",
  "son",
  "sister",
  "brother",
  "grandmother",
  "grandfather",
  "guardian",
  "other",
] as const;

export type PersonRelation = (typeof PERSON_RELATIONS)[number];

export const PERSON_RELATION_LABEL: Record<PersonRelation, string> = {
  wife: "Wife",
  husband: "Husband",
  partner: "Partner",
  mother: "Mother",
  father: "Father",
  daughter: "Daughter",
  son: "Son",
  sister: "Sister",
  brother: "Brother",
  grandmother: "Grandmother",
  grandfather: "Grandfather",
  guardian: "Guardian",
  other: "Someone else",
};

/** Null for "not said" — the column is optional and the select allows blank. */
export function asPersonRelation(value: unknown): PersonRelation | null {
  return (PERSON_RELATIONS as readonly string[]).includes(value as string)
    ? (value as PersonRelation)
    : null;
}

/**
 * The UK school years, in the order a school lists them. Stored in
 * `household_people.year_group` as plain text rather than an enum: the column
 * was free text first, so a value typed in before the picker existed still
 * reads back, and a household outside this ladder isn't locked out of it.
 * `isSchoolYear()` is what the picker uses to decide whether a stored value
 * needs an option of its own.
 */
export const SCHOOL_YEARS = [
  "Nursery",
  "Reception",
  "Year 1",
  "Year 2",
  "Year 3",
  "Year 4",
  "Year 5",
  "Year 6",
  "Year 7",
  "Year 8",
  "Year 9",
  "Year 10",
  "Year 11",
  "Year 12",
  "Year 13",
] as const;

export type SchoolYear = (typeof SCHOOL_YEARS)[number];

export function isSchoolYear(value: string | null): value is SchoolYear {
  return (SCHOOL_YEARS as readonly string[]).includes(value ?? "");
}

/** Someone who lives here. Most of them will never have an account. */
export type HouseholdPerson = {
  id: string;
  name: string;
  kind: PersonKind;
  relation: PersonRelation | null;
  birthday: string | null;
  school_id: string | null;
  year_group: string | null;
  notes: string | null;
  user_id: string | null;
  sort_order: number;
};

export const PEOPLE_SELECT =
  "id, name, kind, relation, birthday, school_id, year_group, notes, user_id, sort_order";

/**
 * How a person reads on one line under their name: "Daughter · Year 5", or
 * "Child · St Mary’s · Year 5" for someone with no relation set. The relation
 * replaces the kind when there is one — "Daughter" says everything "Child"
 * does and more.
 */
export function personSummary(
  person: HouseholdPerson,
  schoolName?: string | null
): string {
  return [
    person.relation
      ? PERSON_RELATION_LABEL[person.relation]
      : PERSON_KIND_LABEL[person.kind],
    schoolName || null,
    person.year_group,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** A list load: rows when it worked, plus a fault sentence the UI can show. */
export type FamilyList<T> = {
  items: T[];
  /** Plain sentence when the load failed; null when it was fine (incl. empty). */
  fault: string | null;
};

function listOk<T>(items: T[]): FamilyList<T> {
  return { items, fault: null };
}

function listFault<T>(label: string, message: string): FamilyList<T> {
  console.error(`[family] ${label}`, message);
  return {
    items: [],
    fault: "We couldn’t load this just now. Try refreshing the page.",
  };
}

/**
 * Everyone in the household, in the order they should be shown. A failure —
 * including the table not being deployed yet — comes back as an empty list
 * plus a fault the page can surface, so a page never falls over on the family
 * list.
 */
export async function loadHouseholdPeople(
  supabase: SupabaseClient,
  householdId: string
): Promise<FamilyList<HouseholdPerson>> {
  const { data, error } = await supabase
    .from("household_people")
    .select(PEOPLE_SELECT)
    .eq("household_id", householdId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return listFault("loadHouseholdPeople", error.message);
  return listOk((data as HouseholdPerson[] | null) ?? []);
}

// --- schools -------------------------------------------------------------

export type School = {
  id: string;
  name: string;
  address: string | null;
  /** Kept beside the address so the picker can be reopened on the same one. */
  postcode: string | null;
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
  "id, name, address, postcode, notes, calendar_url, calendar_title, calendar_last_synced_at, calendar_last_error";

export async function loadSchools(
  supabase: SupabaseClient,
  householdId: string
): Promise<FamilyList<School>> {
  const { data, error } = await supabase
    .from("schools")
    .select(SCHOOLS_SELECT)
    .eq("household_id", householdId)
    .order("created_at", { ascending: true });
  if (error) return listFault("loadSchools", error.message);
  return listOk((data as School[] | null) ?? []);
}

// --- linked calendars ----------------------------------------------------

/**
 * How far ahead a linked ICS feed is read, and read back. A sync caches this
 * far and no further, so a loader asking for more would only ever get the
 * same rows. Shared by the schools' feeds and the household's own, so the two
 * can't cache different amounts of the year.
 */
export const CALENDAR_WINDOW_DAYS = 120;

/** The old name for it, kept so a school's window reads as a school's. */
export const SCHOOL_CALENDAR_WINDOW_DAYS = CALENDAR_WINDOW_DAYS;

/** More than any feed prints in four months, and enough to never truncate one. */
const CALENDAR_ROW_CAP = 500;

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
 * The calendar date an occurrence falls on, as YYYY-MM-DD, in Europe/London.
 * All-day rows are stored at UTC midnight of that civil day; timed rows use
 * the London wall clock so an evening fixture doesn't slip into tomorrow.
 */
export function calendarEventDate(startsAt: string): string | null {
  const at = new Date(startsAt);
  if (Number.isNaN(at.getTime())) return null;
  const parts = calendarDayParts(at);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

/**
 * Every cached school date from today to the end of the window, soonest
 * first. A failure — including the table not being deployed yet — reads as
 * "no school dates", so no page falls over on a calendar.
 */
export async function loadSchoolCalendarEvents(
  supabase: SupabaseClient,
  householdId: string,
  { now = new Date(), withinDays = CALENDAR_WINDOW_DAYS } = {}
): Promise<FamilyList<SchoolCalendarEvent>> {
  const from = startOfCalendarDay(now);
  return loadSchoolCalendarEventsBetween(
    supabase,
    householdId,
    new Date(from).toISOString(),
    new Date(from + withinDays * DAY_MS).toISOString()
  );
}

/**
 * The cached school dates starting between two instants — what a calendar
 * month asks for. The cache only ever holds today to the end of the window,
 * so a month outside that reads as empty rather than wrong.
 */
export async function loadSchoolCalendarEventsBetween(
  supabase: SupabaseClient,
  householdId: string,
  fromIso: string,
  toIso: string
): Promise<FamilyList<SchoolCalendarEvent>> {
  const { data, error } = await supabase
    .from("school_calendar_events")
    .select(SCHOOL_CALENDAR_SELECT)
    .eq("household_id", householdId)
    .gte("starts_at", fromIso)
    .lte("starts_at", toIso)
    .order("starts_at", { ascending: true })
    .limit(CALENDAR_ROW_CAP);
  if (error) return listFault("loadSchoolCalendarEvents", error.message);
  return listOk((data as SchoolCalendarEvent[] | null) ?? []);
}

// --- the household's own shared calendars --------------------------------

/**
 * A calendar the household links for itself: the family Google calendar, a
 * club's fixtures, a shared rota. The same arrangement as a school's feed one
 * level up — we read it, we never write to it — except that the household
 * names it, so `name` is theirs and `calendar_title` is the feed's own.
 */
export type HouseholdCalendar = {
  id: string;
  name: string;
  calendar_url: string | null;
  calendar_title: string | null;
  calendar_last_synced_at: string | null;
  calendar_last_error: string | null;
};

export const HOUSEHOLD_CALENDARS_SELECT =
  "id, name, calendar_url, calendar_title, calendar_last_synced_at, calendar_last_error";

/** A cached occurrence from one of those feeds. Never typed in by hand. */
export type HouseholdCalendarEvent = {
  id: string;
  calendar_id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  location: string | null;
};

export const HOUSEHOLD_CALENDAR_EVENTS_SELECT =
  "id, calendar_id, title, starts_at, ends_at, all_day, location";

/**
 * The household's linked calendars, oldest first. A failure — including the
 * table not being deployed yet — reads as "none linked", the same way the
 * schools do.
 */
export async function loadHouseholdCalendars(
  supabase: SupabaseClient,
  householdId: string
): Promise<FamilyList<HouseholdCalendar>> {
  const { data, error } = await supabase
    .from("household_calendars")
    .select(HOUSEHOLD_CALENDARS_SELECT)
    .eq("household_id", householdId)
    .order("created_at", { ascending: true });
  if (error) return listFault("loadHouseholdCalendars", error.message);
  return listOk((data as HouseholdCalendar[] | null) ?? []);
}

/** Every cached shared date from today to the end of the window. */
export async function loadHouseholdCalendarEvents(
  supabase: SupabaseClient,
  householdId: string,
  { now = new Date(), withinDays = CALENDAR_WINDOW_DAYS } = {}
): Promise<FamilyList<HouseholdCalendarEvent>> {
  const from = startOfCalendarDay(now);
  return loadHouseholdCalendarEventsBetween(
    supabase,
    householdId,
    new Date(from).toISOString(),
    new Date(from + withinDays * DAY_MS).toISOString()
  );
}

/** The shared dates starting between two instants — what a month asks for. */
export async function loadHouseholdCalendarEventsBetween(
  supabase: SupabaseClient,
  householdId: string,
  fromIso: string,
  toIso: string
): Promise<FamilyList<HouseholdCalendarEvent>> {
  const { data, error } = await supabase
    .from("household_calendar_events")
    .select(HOUSEHOLD_CALENDAR_EVENTS_SELECT)
    .eq("household_id", householdId)
    .gte("starts_at", fromIso)
    .lte("starts_at", toIso)
    .order("starts_at", { ascending: true })
    .limit(CALENDAR_ROW_CAP);
  if (error) return listFault("loadHouseholdCalendarEvents", error.message);
  return listOk((data as HouseholdCalendarEvent[] | null) ?? []);
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
): Promise<FamilyList<HouseholdEvent>> {
  const { data, error } = await supabase
    .from("household_events")
    .select(EVENTS_SELECT)
    .eq("household_id", householdId)
    .order("event_date", { ascending: true });
  if (error) return listFault("loadHouseholdEvents", error.message);
  return listOk((data as HouseholdEvent[] | null) ?? []);
}

// --- dates ---------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

/** Civil calendar for birthdays / Coming up / month chrome. UK households. */
export const APP_CALENDAR_TZ = "Europe/London";

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

/** Year/month/day on the Europe/London wall clock for `now`. */
export function calendarDayParts(
  now: Date = new Date(),
  timeZone: string = APP_CALENDAR_TZ
): DateParts {
  const bits = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(now);
  const num = (type: Intl.DateTimeFormatPartTypes) =>
    Number(bits.find((part) => part.type === type)?.value);
  return { year: num("year"), month: num("month"), day: num("day") };
}

/**
 * UTC millisecond instant for midnight of today's London calendar date.
 * Stored YYYY-MM-DD values are compared against this, so "today" means the
 * UK local day rather than the UTC day.
 */
export function startOfCalendarDay(now: Date = new Date()): number {
  const { year, month, day } = calendarDayParts(now);
  return Date.UTC(year, month - 1, day);
}

/** @deprecated Prefer startOfCalendarDay — kept for any stray imports. */
export function startOfUtcDay(now: Date): number {
  return startOfCalendarDay(now);
}

/** Whole days from today (London) to a stored date. Negative once behind us. */
export function daysUntil(date: string | null, now: Date = new Date()): number | null {
  const parts = parseDateParts(date);
  if (!parts) return null;
  const at = Date.UTC(parts.year, parts.month - 1, parts.day);
  return Math.round((at - startOfCalendarDay(now)) / DAY_MS);
}

export type BirthdayInfo = {
  /** The next one to come round, as YYYY-MM-DD. */
  date: string;
  daysAway: number;
  /** The age reached on that date. */
  turning: number;
};

/**
 * The next time a birthday comes round, relative to the London calendar day.
 * A 29 February birthday lands on 1 March in the years that don't have one,
 * which is how Date.UTC rolls it.
 */
export function nextBirthday(
  birthday: string | null,
  now: Date = new Date()
): BirthdayInfo | null {
  const parts = parseDateParts(birthday);
  if (!parts) return null;

  const today = startOfCalendarDay(now);
  const thisYear = calendarDayParts(now).year;

  let at = Date.UTC(thisYear, parts.month - 1, parts.day);
  if (at < today) at = Date.UTC(thisYear + 1, parts.month - 1, parts.day);

  const occurrence = new Date(at);
  return {
    date: occurrence.toISOString().slice(0, 10),
    daysAway: Math.round((at - today) / DAY_MS),
    turning: occurrence.getUTCFullYear() - parts.year,
  };
}

/** First non-null fault from a batch of family list loads. */
export function firstFault(
  ...lists: readonly { fault: string | null }[]
): string | null {
  for (const list of lists) {
    if (list.fault) return list.fault;
  }
  return null;
}
