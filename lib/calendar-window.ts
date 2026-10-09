// Pure calendar windowing — which months sit in one fetch, cache keys, and
// when to prefetch the next window. Client-safe; no I/O.

import {
  monthBounds,
  monthParam,
  parseMonthKey,
  shiftMonth,
  type MonthKey,
} from "@/lib/calendar-month";

/** Bump when the stored payload shape changes. */
export const CALENDAR_CACHE_VERSION = 1;

/** Months before the anchor month included in one window. */
export const CALENDAR_MONTHS_BEFORE = 1;

/** Months after the anchor month included in one window. */
export const CALENDAR_MONTHS_AFTER = 3;

export type CalendarWindowRange = {
  anchor: MonthKey;
  start: MonthKey;
  end: MonthKey;
  months: MonthKey[];
};

/** The five-month window centred on `anchor` (prev + anchor + next 3). */
export function calendarWindowForAnchor(anchor: MonthKey): CalendarWindowRange {
  const start = shiftMonth(anchor, -CALENDAR_MONTHS_BEFORE);
  const months: MonthKey[] = [];
  const span = CALENDAR_MONTHS_BEFORE + 1 + CALENDAR_MONTHS_AFTER;
  for (let i = 0; i < span; i += 1) {
    months.push(shiftMonth(start, i));
  }
  const end = months[months.length - 1]!;
  return { anchor, start, end, months };
}

export function calendarWindowFromYm(
  ym: string | null,
  now: Date = new Date()
): CalendarWindowRange {
  return calendarWindowForAnchor(parseMonthKey(ym, now));
}

export function monthIndexInWindow(
  month: MonthKey,
  window: CalendarWindowRange
): number {
  const key = monthParam(month);
  return window.months.findIndex((m) => monthParam(m) === key);
}

export function isMonthInWindow(
  month: MonthKey,
  window: CalendarWindowRange
): boolean {
  return monthIndexInWindow(month, window) >= 0;
}

/** ISO date bounds covering every day in the window. */
export function windowIsoBounds(window: CalendarWindowRange): {
  from: string;
  to: string;
} {
  const startBounds = monthBounds(window.start);
  const endBounds = monthBounds(window.end);
  return { from: startBounds.from, to: endBounds.to };
}

/**
 * How many months from `month` to the nearest window edge (0 = on an edge).
 * Negative when outside the window.
 */
export function monthsToNearestEdge(
  month: MonthKey,
  window: CalendarWindowRange
): number {
  const idx = monthIndexInWindow(month, window);
  if (idx < 0) return -1;
  return Math.min(idx, window.months.length - 1 - idx);
}

/** Prefetch when within one month of either edge. */
export function shouldPrefetchNextWindow(
  month: MonthKey,
  window: CalendarWindowRange,
  edgeThreshold = 1
): "start" | "end" | null {
  const idx = monthIndexInWindow(month, window);
  if (idx < 0) return null;
  if (idx <= edgeThreshold) return "start";
  if (idx >= window.months.length - 1 - edgeThreshold) return "end";
  return null;
}

/** Next window when the user moves past the leading or trailing edge. */
export function adjacentWindow(
  window: CalendarWindowRange,
  direction: "start" | "end"
): CalendarWindowRange {
  const delta =
    direction === "start" ? -CALENDAR_MONTHS_AFTER : CALENDAR_MONTHS_AFTER;
  const nextAnchor = shiftMonth(window.anchor, delta);
  return calendarWindowForAnchor(nextAnchor);
}

export function calendarCacheStorageKey(householdId: string): string {
  return `hearth-calendar-v${CALENDAR_CACHE_VERSION}-${householdId}`;
}

export type CalendarCacheEnvelope<T> = {
  version: number;
  householdId: string;
  fetchedAt: string;
  anchorYm: string;
  payload: T;
};

export function buildCacheEnvelope<T>(
  householdId: string,
  anchorYm: string,
  payload: T,
  fetchedAt: string = new Date().toISOString()
): CalendarCacheEnvelope<T> {
  return {
    version: CALENDAR_CACHE_VERSION,
    householdId,
    fetchedAt,
    anchorYm,
    payload,
  };
}

export function parseCacheEnvelope<T>(
  raw: string | null | undefined
): CalendarCacheEnvelope<T> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CalendarCacheEnvelope<T>;
    if (parsed.version !== CALENDAR_CACHE_VERSION) return null;
    if (!parsed.householdId || !parsed.anchorYm || !parsed.payload) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Merge two raw calendar payloads — rows deduped by id / key. */
export function mergeCalendarRawPayload<
  T extends {
    people: readonly { id: string }[];
    schools: readonly { id: string }[];
    events: readonly { id: string }[];
    schoolDates: readonly { id: string }[];
    calendars: readonly { id: string }[];
    sharedDates: readonly { id: string }[];
    timetableSlots: readonly { id: string }[];
  },
>(base: T, incoming: T): T {
  return {
    ...base,
    people: dedupeById(base.people, incoming.people),
    schools: dedupeById(base.schools, incoming.schools),
    events: dedupeById(base.events, incoming.events),
    schoolDates: dedupeById(base.schoolDates, incoming.schoolDates),
    calendars: dedupeById(base.calendars, incoming.calendars),
    sharedDates: dedupeById(base.sharedDates, incoming.sharedDates),
    timetableSlots: dedupeById(base.timetableSlots, incoming.timetableSlots),
  };
}

function dedupeById<T extends { id: string }>(
  a: readonly T[],
  b: readonly T[]
): T[] {
  const map = new Map<string, T>();
  for (const row of a) map.set(row.id, row);
  for (const row of b) map.set(row.id, row);
  return [...map.values()];
}
