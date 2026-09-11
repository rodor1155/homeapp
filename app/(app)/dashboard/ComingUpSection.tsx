import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  Cake,
  CalendarDays,
  FileText,
  GraduationCap,
} from "lucide-react";
import { Card } from "@/components/ui";
import {
  birthdayEntries,
  documentEntries,
  eventEntries,
  mergeComingUp,
  schoolEntries,
  type ComingUpEntry,
  type ComingUpKind,
} from "@/lib/coming-up";
import { formatDate, relativeWhen } from "@/lib/dates";
import {
  loadHouseholdEvents,
  loadHouseholdPeople,
  loadSchoolCalendarEvents,
  loadSchools,
} from "@/lib/family";
import type { Locale } from "@/lib/household";
import {
  documentLabel,
  upcomingDates,
  type OverviewDocument,
  type UpcomingDate,
} from "@/lib/home-overview";
import { createClient } from "@/lib/supabase-server";
import { loadOverviewDocuments } from "./overview-data";

const SOON_DAYS = 30;

const COMING_UP_ICON: Record<ComingUpKind, typeof FileText> = {
  document: FileText,
  birthday: Cake,
  event: CalendarDays,
  school: GraduationCap,
};

type ReminderRow = {
  document_id: string;
  kind: string;
  due_date: string;
};

const KIND_LABEL: Record<string, string> = {
  renewal: "Renewal",
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
  const [documents, scheduled, people, events, schools, schoolDates] =
    await Promise.all([
      loadOverviewDocuments(householdId),
      scheduledReminders(supabase, householdId),
      loadHouseholdPeople(supabase, householdId),
      loadHouseholdEvents(supabase, householdId),
      loadSchools(supabase, householdId),
      loadSchoolCalendarEvents(supabase, householdId),
    ]);

  const reminded = remindedEntries(scheduled, documents);
  const entries = mergeComingUp(
    documentEntries(upcomingDates(documents), (entry) =>
      reminded.has(entryKey(entry))
    ),
    birthdayEntries(people),
    eventEntries(events, people),
    schoolEntries(schoolDates, schools)
  );

  return (
    <ComingUp
      entries={entries}
      locale={locale}
      hasPeople={people.length > 0}
    />
  );
}

function ComingUp({
  entries,
  locale,
  hasPeople,
}: {
  entries: readonly ComingUpEntry[];
  locale: Locale;
  hasPeople: boolean;
}) {
  return (
    <Card
      title="Coming up"
      action={
        <Link href="/family" className="text-action text-xs">
          Family dates
        </Link>
      }
    >
      {entries.length === 0 ? (
        <p className="text-sm text-ink-faint">
          {hasPeople
            ? "Nothing on the horizon — no renewals, birthdays or dates ahead."
            : "Nothing on the horizon yet. Add the family and their birthdays show up here."}
        </p>
      ) : (
        <ul className="divide-y divide-rule">
          {entries.map((entry) => {
            const soon = entry.daysAway <= SOON_DAYS;
            const Icon = COMING_UP_ICON[entry.kind];
            return (
              <li
                key={entry.key}
                className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span
                    aria-hidden
                    className={`shrink-0 ${
                      entry.kind === "birthday"
                        ? "text-sage"
                        : soon
                          ? "mark-review"
                          : "text-ink-faint"
                    }`}
                  >
                    <Icon size={15} strokeWidth={1.9} />
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
              </li>
            );
          })}
        </ul>
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
