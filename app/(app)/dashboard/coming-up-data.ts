import type { SupabaseClient } from "@supabase/supabase-js";
import {
  birthdayEntries,
  documentEntries,
  eventEntries,
  mergeComingUp,
  schoolEntries,
  sharedEntries,
  timetableEntries,
  routineEntries,
  type ComingUpEntry,
} from "@/lib/coming-up";
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
import {
  documentLabel,
  upcomingDates,
  type OverviewDocument,
} from "@/lib/home-overview";
import { loadOverviewDocuments } from "./overview-data";

type ReminderRow = {
  document_id: string;
  kind: string;
  due_date: string;
};

const KIND_LABEL: Record<string, string> = {
  renewal: "Renews",
  end: "Ends",
};

export type ComingUpData = {
  entries: ComingUpEntry[];
  people: Awaited<ReturnType<typeof loadHouseholdPeople>>["items"];
  loadFault: string | null;
};

export async function loadComingUpData(
  supabase: SupabaseClient,
  householdId: string
): Promise<ComingUpData> {
  const [
    documents,
    scheduled,
    peopleLoad,
    eventsLoad,
    schoolsLoad,
    schoolDatesLoad,
    calendarsLoad,
    sharedDatesLoad,
    timetableLoad,
    routinesLoad,
  ] = await Promise.all([
    loadOverviewDocuments(householdId),
    scheduledReminders(supabase, householdId),
    loadHouseholdPeople(supabase, householdId),
    loadHouseholdEvents(supabase, householdId),
    loadSchools(supabase, householdId),
    loadSchoolCalendarEvents(supabase, householdId),
    loadHouseholdCalendars(supabase, householdId),
    loadHouseholdCalendarEvents(supabase, householdId),
    loadPersonTimetableSlots(supabase, householdId),
    loadHouseholdRoutines(supabase, householdId),
  ]);

  const people = peopleLoad.items;
  const reminded = remindedEntries(scheduled, documents);
  const entries = mergeComingUp(
    documentEntries(upcomingDates(documents), (entry) =>
      reminded.has(entryKey(entry))
    ),
    birthdayEntries(people),
    eventEntries(eventsLoad.items, people),
    schoolEntries(schoolDatesLoad.items, schoolsLoad.items, people),
    sharedEntries(sharedDatesLoad.items, calendarsLoad.items),
    timetableEntries(timetableLoad.items, people),
    routineEntries(routinesLoad.items)
  );

  const loadFault = firstFault(
    peopleLoad,
    eventsLoad,
    schoolsLoad,
    schoolDatesLoad,
    calendarsLoad,
    sharedDatesLoad,
    timetableLoad,
    routinesLoad
  );

  return { entries, people, loadFault };
}

function entryKey(entry: { provider: string; date: string; label: string }) {
  return `${entry.provider}|${entry.date}|${entry.label}`;
}

async function scheduledReminders(
  supabase: SupabaseClient,
  householdId: string
): Promise<ReminderRow[]> {
  const { data } = await supabase
    .from("reminders")
    .select("document_id, kind, due_date")
    .eq("household_id", householdId)
    .eq("status", "scheduled");
  return (data as ReminderRow[] | null) ?? [];
}

function remindedEntries(
  reminders: readonly ReminderRow[],
  documents: readonly OverviewDocument[]
): Set<string> {
  const byId = new Map(documents.map((doc) => [doc.id, doc]));
  const keys = new Set<string>();

  for (const row of reminders) {
    const doc = byId.get(row.document_id);
    const label = KIND_LABEL[row.kind];
    if (!doc || !label) continue;
    keys.add(
      entryKey({
        provider: documentLabel(doc),
        date: row.due_date,
        label,
      })
    );
  }

  return keys;
}
