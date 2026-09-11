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
};

export const SCHOOLS_SELECT = "id, name, address, notes";

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
