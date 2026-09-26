import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { Card } from "@/components/ui";
import type { ComingUpEntry } from "@/lib/coming-up";
import type { Locale } from "@/lib/household";
import { createClient } from "@/lib/supabase-server";
import ComingUpList from "./ComingUpList";
import { loadComingUpData } from "./coming-up-data";

/**
 * How near the first thing has to be before it gets the "coming up in N days"
 * line and the warm wash. Wider than SOON_DAYS, so a month-and-a-bit away
 * still gets the count — it is the next thing either way.
 */
const HEADLINE_DAYS = 35;

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
  const { entries, people, loadFault } = await loadComingUpData(
    supabase,
    householdId
  );

  const brief = typeof limit === "number" && limit > 0;
  const shown = brief ? entries.slice(0, limit) : entries;
  const hidden = brief ? Math.max(0, entries.length - shown.length) : 0;

  return (
    <ComingUp
      entries={shown}
      people={people}
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
  people,
  locale,
  hasPeople,
  loadFault,
  hiddenCount = 0,
  brief = false,
}: {
  entries: readonly ComingUpEntry[];
  people: Awaited<ReturnType<typeof loadComingUpData>>["people"];
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
          people={people}
          locale={locale}
          headlineKey={headlineKey}
          hiddenCount={hiddenCount}
        />
      )}
    </Card>
  );
}
