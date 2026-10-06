// Client-side sessionStorage mirror for the calendar window payload.

import {
  buildCacheEnvelope,
  calendarCacheStorageKey,
  mergeCalendarRawPayload,
  parseCacheEnvelope,
  type CalendarCacheEnvelope,
} from "@/lib/calendar-window";
import type { CalendarWindowPayload } from "@/lib/calendar-payload";

export function readCalendarCache(
  householdId: string
): CalendarCacheEnvelope<CalendarWindowPayload> | null {
  if (typeof window === "undefined") return null;
  try {
    return parseCacheEnvelope<CalendarWindowPayload>(
      sessionStorage.getItem(calendarCacheStorageKey(householdId))
    );
  } catch {
    return null;
  }
}

export function writeCalendarCache(
  householdId: string,
  payload: CalendarWindowPayload
): void {
  if (typeof window === "undefined") return;
  try {
    const envelope = buildCacheEnvelope(
      householdId,
      payload.window.anchorYm,
      payload
    );
    sessionStorage.setItem(
      calendarCacheStorageKey(householdId),
      JSON.stringify(envelope)
    );
  } catch {
    /* quota or private mode */
  }
}

export function mergeIntoCalendarCache(
  householdId: string,
  incoming: CalendarWindowPayload
): CalendarWindowPayload {
  const cached = readCalendarCache(householdId);
  if (!cached) {
    writeCalendarCache(householdId, incoming);
    return incoming;
  }
  const merged: CalendarWindowPayload = {
    ...incoming,
    ...mergeCalendarRawPayload(cached.payload, incoming),
    fetchedAt: incoming.fetchedAt,
    window: incoming.window,
    loadFault: incoming.loadFault ?? cached.payload.loadFault,
  };
  writeCalendarCache(householdId, merged);
  return merged;
}
