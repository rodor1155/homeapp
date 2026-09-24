// Detail payload for a calendar / coming-up row. Client-safe.

import type { CalendarItem } from "@/lib/calendar-month";

export type CalendarEventDetail = {
  title: string;
  subtitle?: string;
  date: string;
  allDay?: boolean;
  startsAt?: string;
  endsAt?: string | null;
  location?: string | null;
  description?: string | null;
  url?: string | null;
  notes?: string | null;
};

export function isTappableCalendarItem(item: CalendarItem): boolean {
  return item.kind === "school" || item.kind === "shared" || item.kind === "event";
}

/** Enough shape to decide / map a coming-up row without importing server-only code. */
export type ComingUpDetailSource = {
  kind: string;
  title: string;
  note: string;
  date: string;
  allDay?: boolean;
  startsAt?: string;
  endsAt?: string | null;
  location?: string | null;
  description?: string | null;
  url?: string | null;
};

export function isTappableComingUp(entry: { kind: string }): boolean {
  return entry.kind === "school" || entry.kind === "shared";
}

export function detailFromCalendarItem(
  item: CalendarItem
): CalendarEventDetail | null {
  if (!isTappableCalendarItem(item)) return null;
  return {
    title: item.title,
    subtitle: item.note,
    date: item.date,
    allDay: item.allDay,
    startsAt: item.startsAt,
    endsAt: item.endsAt,
    location: item.location,
    description: item.description,
    url: item.url,
    notes: item.notes,
  };
}

export function detailFromComingUp(
  entry: ComingUpDetailSource
): CalendarEventDetail | null {
  if (!isTappableComingUp(entry)) return null;
  return {
    title: entry.title,
    subtitle: entry.note,
    date: entry.date,
    allDay: entry.allDay,
    startsAt: entry.startsAt,
    endsAt: entry.endsAt,
    location: entry.location,
    description: entry.description,
    url: entry.url,
  };
}
