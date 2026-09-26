import Link from "next/link";
import {
  Backpack,
  Repeat,
  Cake,
  CalendarDays,
  FileText,
  GraduationCap,
  RefreshCw,
  Share2,
} from "lucide-react";
import {
  COMING_UP_TONE,
  groupByMonth,
  type ComingUpEntry,
  type ComingUpKind,
} from "@/lib/coming-up";
import {
  detailFromComingUp,
  isTappableComingUp,
} from "@/lib/calendar-event-detail";
import { formatDate, formatMonth, relativeWhen } from "@/lib/dates";
import type { HouseholdPerson } from "@/lib/family";
import type { Locale } from "@/lib/household";
import { memberEdgeClass } from "@/lib/member-colours";
import { TONE_PILL } from "@/lib/tones";
import ComingUpTappableRow from "./ComingUpTappableRow";

const SOON_DAYS = 30;

const COMING_UP_ICON: Record<ComingUpKind, typeof FileText> = {
  document: FileText,
  renewal: RefreshCw,
  birthday: Cake,
  event: CalendarDays,
  school: GraduationCap,
  shared: Share2,
  timetable: Backpack,
  routine: Repeat,
};

export default function ComingUpList({
  entries,
  people,
  locale,
  headlineKey,
  hiddenCount = 0,
}: {
  entries: readonly ComingUpEntry[];
  people: readonly HouseholdPerson[];
  locale: Locale;
  headlineKey: string | null;
  hiddenCount?: number;
}) {
  const months = groupByMonth(entries);
  const showMonths = months.length > 1;

  return (
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
              <EntryRow
                key={entry.key}
                entry={entry}
                people={people}
                locale={locale}
                headline={entry.key === headlineKey}
              />
            ))}
          </ul>
        </div>
      ))}
      {hiddenCount > 0 ? (
        <p className="px-2.5 pt-1">
          <Link href="/calendar" className="text-action text-xs">
            {hiddenCount === 1
              ? "1 more on the calendar"
              : `${hiddenCount} more on the calendar`}
          </Link>
        </p>
      ) : null}
    </div>
  );
}

function EntryRow({
  entry,
  people,
  locale,
  headline,
}: {
  entry: ComingUpEntry;
  people: readonly HouseholdPerson[];
  locale: Locale;
  headline: boolean;
}) {
  const soon = entry.daysAway <= SOON_DAYS || entry.overdue;
  const Icon = COMING_UP_ICON[entry.kind];
  const renewalId = entry.kind === "renewal" ? entry.renewalId : undefined;
  const tappable = !renewalId && isTappableComingUp(entry);
  const detail = tappable ? detailFromComingUp(entry) : null;
  const edge = memberEdgeClass(entry.personId, people);
  const shellClass = `coming-up-member-edge rounded-[var(--radius)] px-3 py-2.5 ${edge} ${
    headline
      ? "border border-ochre/25 bg-ochre-wash shadow-[var(--shadow-card)]"
      : tappable
        ? "transition-colors hover:bg-navy-wash/70"
        : "hover:bg-navy-wash/70"
  }`;

  const body = (
    <>
      {headline ? (
        <p className="mark-review mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide">
          <span aria-hidden className="h-1.5 w-1.5 rounded-pill bg-ochre" />
          {countdown(entry.daysAway, entry.overdue)}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden
            className={`icon-well ${
              headline
                ? "bg-ochre-tint text-ochre"
                : TONE_PILL[COMING_UP_TONE[entry.kind]]
            }`}
          >
            <Icon size={17} strokeWidth={1.9} />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold leading-snug text-ink">
              {entry.title}
            </span>
            <span className="block text-xs leading-relaxed text-ink-faint">
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
            {entry.overdue ? "Overdue" : relativeWhen(entry.daysAway)}
          </span>
        </span>
      </div>
    </>
  );

  return (
    <li>
      {tappable && detail ? (
        <ComingUpTappableRow
          detail={detail}
          locale={locale}
          className={shellClass}
        >
          {body}
        </ComingUpTappableRow>
      ) : renewalId ? (
        <Link href={`/family?renewal=${renewalId}#renewals`} className={shellClass}>
          {body}
        </Link>
      ) : (
        <div className={shellClass}>{body}</div>
      )}
    </li>
  );
}

function countdown(daysAway: number, overdue?: boolean): string {
  if (overdue) return "Overdue";
  if (daysAway <= 0) return "Coming up today";
  if (daysAway === 1) return "Coming up tomorrow";
  return `Coming up in ${daysAway} days`;
}
