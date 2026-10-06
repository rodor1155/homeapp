// Build calendar items for one month from a wide-window raw payload. Client-safe.

import {
  birthdayItems,
  eventItems,
  schoolItems,
  sharedItems,
  sortItems,
  timetableItems,
  type CalendarItem,
  type MonthKey,
} from "@/lib/calendar-month";
import type { CalendarRawPayload } from "@/lib/calendar-payload";

export function buildCalendarItemsForMonth(
  raw: CalendarRawPayload,
  month: MonthKey
): CalendarItem[] {
  return sortItems([
    ...birthdayItems(raw.people, month),
    ...eventItems(raw.events, raw.people, month),
    ...schoolItems(raw.schoolDates, raw.schools, month, raw.people),
    ...sharedItems(raw.sharedDates, raw.calendars, month),
    ...timetableItems(raw.timetableSlots, raw.people, month),
  ]);
}
