// Serializable calendar window payload — shared between server loader and client.

import type {
  HouseholdCalendar,
  HouseholdCalendarEvent,
  HouseholdEvent,
  HouseholdPerson,
  School,
  SchoolCalendarEvent,
} from "@/lib/family";
import type { PersonTimetableSlot } from "@/lib/timetable";
import type { CalendarWindowRange } from "@/lib/calendar-window";
import { monthParam } from "@/lib/calendar-month";

export type CalendarRawPayload = {
  people: HouseholdPerson[];
  schools: School[];
  events: HouseholdEvent[];
  schoolDates: SchoolCalendarEvent[];
  calendars: HouseholdCalendar[];
  sharedDates: HouseholdCalendarEvent[];
  timetableSlots: PersonTimetableSlot[];
};

export type CalendarWindowPayload = CalendarRawPayload & {
  fetchedAt: string;
  window: {
    anchorYm: string;
    startYm: string;
    endYm: string;
  };
  loadFault: string | null;
};

export function serializeWindow(
  data: CalendarRawPayload,
  window: CalendarWindowRange,
  loadFault: string | null,
  fetchedAt: string = new Date().toISOString()
): CalendarWindowPayload {
  return {
    ...data,
    fetchedAt,
    window: {
      anchorYm: monthParam(window.anchor),
      startYm: monthParam(window.start),
      endYm: monthParam(window.end),
    },
    loadFault,
  };
}
