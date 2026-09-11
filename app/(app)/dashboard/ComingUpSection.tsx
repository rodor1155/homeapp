import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  Backpack,
  Cake,
  CalendarDays,
  FileText,
  GraduationCap,
  Share2,
} from "lucide-react";
import { Card } from "@/components/ui";
import {
  birthdayEntries,
  COMING_UP_TONE,
  documentEntries,
  eventEntries,
  groupByMonth,
  mergeComingUp,
  schoolEntries,
  sharedEntries,
  timetableEntries,
  type ComingUpEntry,
  type ComingUpKind,
} from "@/lib/coming-up";
import { formatDate, formatMonth, relativeWhen } from "@/lib/dates";
import {
  firstFault,
  loadHouseholdCalendarEvents,
  loadHouseholdCalendars,
  loadHouseholdEvents,
  loadHouseholdPeople,
  loadSchoolCalendarEvents,
  loadSchools,
} from "@/lib/family";
import { loadPersonTimetableSlots } from "@/lib/timetable";
import type { Locale } from "@/lib/household";
import { TONE_PILL } from "@/lib/tones";
import {
  documentLabel,
  upcomingDates,
  type OverviewDocument,
  type UpcomingDate,
} from "@/lib/home-overview";
import { createClient } from "@/lib/supabase-server";
import { loadOverviewDocuments } from "./overview-data";

const SOON_DAYS = 30;

/**
 * How near the first thing has to be before it gets the "coming up in N days"
 * line and the warm wash. Wider than SOON_DAYS, so a month-and-a-bit away
 * still gets the count — it is the next thing either way.
 */
const HEADLINE_DAYS = 35;

const COMING_UP_ICON: Record<ComingUpKind, typeof FileText> = {
  document: FileText,
  birthday: Cake,
  event: CalendarDays,
  school: GraduationCap,
  shared: Share2,
  timetable: Backpack,
};

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
}: {
  householdId: string;
  locale: Locale;
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
  ]);

  const people = peopleLoad.items;
  const events = eventsLoad.items;
  const schools = schoolsLoad.items;
  const schoolDates = schoolDatesLoad.items;
  const calendars = calendarsLoad.items;
  const sharedDates = sharedDatesLoad.items;
  const timetableSlots = timetableLoad.items;
  const loadFault = firstFault(
    peopleLoad,
    eventsLoad,
    schoolsLoad,
    schoolDatesLoad,
    calendarsLoad,
    sharedDatesLoad,
    timetableLoad
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
    timetableEntries(timetableSlots, people)
  );

  return (
    <ComingUp
      entries={entries}
      locale={locale}
      hasPeople={people.length > 0}
      loadFault={loadFault}
    />
  );
}

function ComingUp({
  entries,
  locale,
  hasPeople,
  loadFault,
}: {
  entries: readonly ComingUpEntry[];
  locale: Locale;
  hasPeople: boolean;
  loadFault: string | null;
}) {
  const months = groupByMonth(entries);
  // Only worth writing the month out when the list actually crosses one.
  const showMonths = months.length > 1;
  const first = entries[0];
  const headlineKey =
    first && first.daysAway <= HEADLINE_DAYS ? first.key : null;

  return (
    <Card
      title="Coming up"
      action={
        <Link href="/calendar" className="text-action text-xs">
          Open the calendar
        </Link>
      }
    >
      {loadFault ? (
        <p role="status" className="mb-3 text-sm text-oxblood">
          {loadFault}
        </p>
      ) : null}
      {entries.length === 0 ? (
        <p className="text-sm text-ink-faint">
          {hasPeople
            ? "Nothing on the horizon — no renewals, birthdays or dates ahead."
            : "Nothing on the horizon yet. Add the family and their birthdays show up here."}
        </p>
      ) : (
        <div className="-mx-1 flex flex-col gap-3.5">
          {months.map((month) => (
            <div key={month.key}>
              {showMonths ? (
                <h3 className="px-2.5 pb-1 text-xs font-semibold uppercase tracking-wide text-ink-faint">
                  {formatMonth(month.key, locale)}
                </h3>
              ) : null}
              <ul className="flex flex-col gap-1">
                {month.entries.map((entry) => (
                  <Entry
                    key={entry.key}
                    entry={entry}
                    locale={locale}
                    headline={entry.key === headlineKey}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/** One dated thing. The next one wears the countdown and the warm wash. */
function Entry({
  entry,
  locale,
  headline,
}: {
  entry: ComingUpEntry;
  locale: Locale;
  headline: boolean;
}) {
  const soon = entry.daysAway <= SOON_DAYS;
  const Icon = COMING_UP_ICON[entry.kind];

  return (
    <li className={`rounded-lg px-2.5 py-2 ${headline ? "bg-ochre-wash" : ""}`}>
      {headline ? (
        <p className="mark-review mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide">
          <span aria-hidden className="h-1.5 w-1.5 rounded-pill bg-ochre" />
          {countdown(entry.daysAway)}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2.5">
          {/* The next thing wears ochre whatever it is — that is attention,
              not a kind. Everything below it keeps its own colour. */}
          <span
            aria-hidden
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-pill ${
              headline
                ? "bg-ochre-tint text-ochre"
                : TONE_PILL[COMING_UP_TONE[entry.kind]]
            }`}
          >
            <Icon size={17} strokeWidth={1.9} />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-ink">
              {entry.title}
            </span>
            <span className="block truncate text-xs text-ink-faint">
              {entry.note}
            </span>
          </span>
        </span>
        <span className="tnum shrink-0 text-right">
          <span className="block text-sm text-ink">
            {formatDate(entry.date, locale)}
          </span>
          <span
            className={`block text-xs ${
              soon ? "mark-review font-medium" : "text-ink-faint"
            }`}
          >
            {relativeWhen(entry.daysAway)}
          </span>
        </span>
      </div>
    </li>
  );
}

/** The little uppercase line over the next thing: "Coming up in 31 days". */
function countdown(daysAway: number): string {
  if (daysAway <= 0) return "Coming up today";
  if (daysAway === 1) return "Coming up tomorrow";
  return `Coming up in ${daysAway} days`;
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
