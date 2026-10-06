import "server-only";

import type { MonthKey } from "@/lib/calendar-month";
import {
  calendarWindowForAnchor,
  windowIsoBounds,
  type CalendarWindowRange,
} from "@/lib/calendar-window";
import {
  serializeWindow,
  type CalendarRawPayload,
  type CalendarWindowPayload,
} from "@/lib/calendar-payload";
import {
  firstFault,
  loadHouseholdCalendarEventsBetween,
  loadHouseholdCalendars,
  loadHouseholdEvents,
  loadHouseholdPeople,
  loadSchoolCalendarEventsBetween,
  loadSchools,
} from "@/lib/family";
import { loadPersonTimetableSlots } from "@/lib/timetable";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function loadCalendarWindow(
  supabase: SupabaseClient,
  householdId: string,
  anchor: MonthKey
): Promise<CalendarWindowPayload> {
  const window = calendarWindowForAnchor(anchor);
  const { from, to } = windowIsoBounds(window);
  const fromIso = `${from}T00:00:00.000Z`;
  const toIso = `${to}T23:59:59.999Z`;

  const [
    peopleLoad,
    schoolsLoad,
    eventsLoad,
    schoolDatesLoad,
    calendarsLoad,
    sharedDatesLoad,
    timetableLoad,
  ] = await Promise.all([
    loadHouseholdPeople(supabase, householdId),
    loadSchools(supabase, householdId),
    loadHouseholdEvents(supabase, householdId),
    loadSchoolCalendarEventsBetween(supabase, householdId, fromIso, toIso),
    loadHouseholdCalendars(supabase, householdId),
    loadHouseholdCalendarEventsBetween(supabase, householdId, fromIso, toIso),
    loadPersonTimetableSlots(supabase, householdId),
  ]);

  const raw: CalendarRawPayload = {
    people: peopleLoad.items,
    schools: schoolsLoad.items,
    events: eventsLoad.items,
    schoolDates: schoolDatesLoad.items,
    calendars: calendarsLoad.items,
    sharedDates: sharedDatesLoad.items,
    timetableSlots: timetableLoad.items,
  };

  const loadFault = firstFault(
    peopleLoad,
    schoolsLoad,
    eventsLoad,
    schoolDatesLoad,
    calendarsLoad,
    sharedDatesLoad,
    timetableLoad
  );

  return serializeWindow(raw, window, loadFault);
}

export { buildCalendarItemsForMonth as calendarItemsForMonth } from "@/lib/calendar-items";

export type { CalendarWindowRange };
