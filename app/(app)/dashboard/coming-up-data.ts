import type { SupabaseClient } from "@supabase/supabase-js";
import {
  birthdayEntries,
  documentEntries,
  eventEntries,
  mergeComingUp,
  renewalEntries,
  schoolEntries,
  BIRTHDAY_HORIZON_DAYS,
  SHARED_ENTRY_LIMIT,
  SHARED_HORIZON_DAYS,
  SCHOOL_ENTRY_LIMIT,
  SCHOOL_HORIZON_DAYS,
  sharedEntries,
  timetableEntries,
  routineEntries,
  type ComingUpEntry,
} from "@/lib/coming-up";
import {
  buildWeekAhead,
  isWeekAheadWindow,
  weekAheadHorizonDays,
  weekAheadRange,
  type WeekAheadModel,
} from "@/lib/week-ahead";
import { loadRenewalItems } from "@/lib/renewals";
import {
  firstFault,
  loadHouseholdCalendarEvents,
  loadHouseholdCalendars,
  loadHouseholdEvents,
  loadHouseholdPeople,
  loadSchoolCalendarEvents,
  loadSchools,
} from "@/lib/family";
import { loadHouseholdRoutines } from "@/lib/routines";
import { loadPersonTimetableSlots } from "@/lib/timetable";
import { upcomingDates } from "@/lib/home-overview";
import { loadOverviewDocuments } from "./overview-data";

export type ComingUpData = {
  entries: ComingUpEntry[];
  people: Awaited<ReturnType<typeof loadHouseholdPeople>>["items"];
  loadFault: string | null;
  weekAhead: WeekAheadModel | null;
};

export async function loadComingUpData(
  supabase: SupabaseClient,
  householdId: string,
  now: Date = new Date(),
  locale: "UK" | "US" = "UK"
): Promise<ComingUpData> {
  const inWeekAhead = isWeekAheadWindow(now);
  const horizon = inWeekAhead ? weekAheadHorizonDays(now) : undefined;
  const schoolWithin = horizon ?? SCHOOL_HORIZON_DAYS;
  const sharedWithin = horizon ?? SHARED_HORIZON_DAYS;
  const schoolLimit = inWeekAhead ? 50 : SCHOOL_ENTRY_LIMIT;
  const sharedLimit = inWeekAhead ? 30 : SHARED_ENTRY_LIMIT;
  const [
    documents,
    peopleLoad,
    eventsLoad,
    schoolsLoad,
    schoolDatesLoad,
    calendarsLoad,
    sharedDatesLoad,
    timetableLoad,
    routinesLoad,
    renewalsLoad,
  ] = await Promise.all([
    loadOverviewDocuments(householdId),
    loadHouseholdPeople(supabase, householdId),
    loadHouseholdEvents(supabase, householdId),
    loadSchools(supabase, householdId),
    loadSchoolCalendarEvents(supabase, householdId),
    loadHouseholdCalendars(supabase, householdId),
    loadHouseholdCalendarEvents(supabase, householdId),
    loadPersonTimetableSlots(supabase, householdId),
    loadHouseholdRoutines(supabase, householdId),
    loadRenewalItems(supabase, householdId),
  ]);

  const people = peopleLoad.items;
  const entries = mergeComingUp(
    documentEntries(upcomingDates(documents)),
    birthdayEntries(people, now, horizon ?? BIRTHDAY_HORIZON_DAYS),
    eventEntries(eventsLoad.items, people, now),
    schoolEntries(
      schoolDatesLoad.items,
      schoolsLoad.items,
      people,
      now,
      schoolWithin,
      schoolLimit
    ),
    sharedEntries(
      sharedDatesLoad.items,
      calendarsLoad.items,
      now,
      sharedWithin,
      sharedLimit
    ),
    timetableEntries(timetableLoad.items, people, now),
    routineEntries(routinesLoad.items, now),
    renewalEntries(renewalsLoad.items, now)
  );

  const schoolByEventId = new Map(
    schoolDatesLoad.items.map((event) => [event.id, event.school_id])
  );

  const weekAhead = inWeekAhead
    ? buildWeekAhead(
        { entries, people, locale, schoolByEventId },
        weekAheadRange(now)
      )
    : null;

  const loadFault = firstFault(
    peopleLoad,
    eventsLoad,
    schoolsLoad,
    schoolDatesLoad,
    calendarsLoad,
    sharedDatesLoad,
    timetableLoad,
    routinesLoad,
    renewalsLoad
  );

  return { entries, people, loadFault, weekAhead };
}
