import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CalendarDays } from "lucide-react";
import { Card } from "@/components/ui";
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
import type { Locale } from "@/lib/household";
import {
  documentLabel,
  upcomingDates,
  type OverviewDocument,
  type UpcomingDate,
} from "@/lib/home-overview";
import { createClient } from "@/lib/supabase-server";
import ComingUpList from "./ComingUpList";
import { loadOverviewDocuments } from "./overview-data";

/**
 * How near the first thing has to be before it gets the "coming up in N days"
 * line and the warm wash. Wider than SOON_DAYS, so a month-and-a-bit away
 * still gets the count — it is the next thing either way.
 */
const HEADLINE_DAYS = 35;

type ReminderRow = {
  document_id: string;
  kind: string;
  due_date: string;
};

const KIND_LABEL: Record<string, string> = {
  renewal: "Renews",
  end: "Ends",
};

export default async function ComingUpSection({
  householdId,
  locale,
  limit,
}: {
  householdId: string;
  locale: Locale;
  /** Cap the briefing (Home). Omit for the full list. */
  limit?: number;
}) {
  const supabase = await createClient();
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
  const events = eventsLoad.items;
  const schools = schoolsLoad.items;
  const schoolDates = schoolDatesLoad.items;
  const calendars = calendarsLoad.items;
  const sharedDates = sharedDatesLoad.items;
  const timetableSlots = timetableLoad.items;
  const routines = routinesLoad.items;
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

  const reminded = remindedEntries(scheduled, documents);
  const entries = mergeComingUp(
    documentEntries(upcomingDates(documents), (entry) =>
      reminded.has(entryKey(entry))
    ),
    birthdayEntries(people),
    eventEntries(events, people),
    schoolEntries(schoolDates, schools, people),
    sharedEntries(sharedDates, calendars),
    timetableEntries(timetableSlots, people),
    routineEntries(routines)
  );

  const brief = typeof limit === "number" && limit > 0;
  const shown = brief ? entries.slice(0, limit) : entries;
  const hidden = brief ? Math.max(0, entries.length - shown.length) : 0;

  return (
    <ComingUp
      entries={shown}
      locale={locale}
      hasPeople={people.length > 0}
      loadFault={loadFault}
      hiddenCount={hidden}
      brief={brief}
    />
  );
}

function ComingUp({
  entries,
  locale,
  hasPeople,
  loadFault,
  hiddenCount = 0,
  brief = false,
}: {
  entries: readonly ComingUpEntry[];
  locale: Locale;
  hasPeople: boolean;
  loadFault: string | null;
  hiddenCount?: number;
  brief?: boolean;
}) {
  const first = entries[0];
  const headlineKey =
    first && first.daysAway <= HEADLINE_DAYS ? first.key : null;

  return (
    <Card
      title="Coming up"
      action={
        <Link href="/calendar" className="text-action text-xs">
          {brief ? "See all" : "Open the calendar"}
        </Link>
      }
    >
      {loadFault ? (
        <p role="status" className="mb-3 text-sm text-oxblood">
          {loadFault}
        </p>
      ) : null}
      {entries.length === 0 ? (
        <div className="empty-state rounded-lg bg-ochre-wash/60 px-3 py-5">
          <span
            aria-hidden
            className="icon-well-lg icon-well bg-ochre-tint text-ochre"
          >
            <CalendarDays size={20} strokeWidth={1.9} />
          </span>
          <p className="mt-2 text-base font-semibold text-ink">Nothing coming up</p>
          <p className="empty-state-body">
            {hasPeople
              ? "No renewals, birthdays or dates on the horizon right now."
              : "Add the family on Family and their birthdays show up here."}
          </p>
          {!hasPeople ? (
            <Link href="/family" className="btn-quiet mt-3">
              Open Family
            </Link>
          ) : (
            <Link href="/calendar" className="btn-quiet mt-3">
              Open the calendar
            </Link>
          )}
        </div>
      ) : (
        <ComingUpList
          entries={entries}
          locale={locale}
          headlineKey={headlineKey}
          hiddenCount={hiddenCount}
        />
      )}
    </Card>
  );
}

function entryKey(entry: Pick<UpcomingDate, "provider" | "date" | "label">) {
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
