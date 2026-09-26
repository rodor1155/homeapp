"use client";

import {
  COMING_UP_TONE,
  groupByMonth,
  type ComingUpEntry,
} from "@/lib/coming-up";
import {
  detailFromComingUp,
  isTappableComingUp,
} from "@/lib/calendar-event-detail";
import { formatDate, formatMonth, relativeWhen } from "@/lib/dates";
import { memberEdgeClass, type PersonSortable } from "@/lib/evening-map";
import type { Locale } from "@/lib/household";
import { TONE_PILL } from "@/lib/tones";
import BottomSheet from "@/components/BottomSheet";
import ComingUpTappableRow from "./ComingUpTappableRow";
import Link from "next/link";
import {
  Backpack,
  Cake,
  CalendarDays,
  FileText,
  GraduationCap,
  RefreshCw,
  Repeat,
  Share2,
  type LucideIcon,
} from "lucide-react";

const COMING_UP_ICON: Record<string, LucideIcon> = {
  document: FileText,
  renewal: RefreshCw,
  birthday: Cake,
  event: CalendarDays,
  school: GraduationCap,
  shared: Share2,
  timetable: Backpack,
  routine: Repeat,
};

export default function EveningComingUpSheet({
  id,
  open,
  onClose,
  entries,
  people,
  locale,
}: {
  id: string;
  open: boolean;
  onClose: () => void;
  entries: readonly ComingUpEntry[];
  people: readonly PersonSortable[];
  locale: Locale;
}) {
  const months = groupByMonth(entries);
  const showMonths = months.length > 1;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Coming up"
      className="evening-sheet"
    >
      <div id={id} className="flex flex-col gap-3.5 pb-2">
        {entries.length === 0 ? (
          <p className="text-sm text-slate-muted">Nothing on the horizon.</p>
        ) : (
          months.map((month) => (
            <div key={month.key}>
              {showMonths ? (
                <h3 className="pb-1 text-xs font-semibold uppercase tracking-wide text-slate-muted">
                  {formatMonth(month.key, locale)}
                </h3>
              ) : null}
              <ul className="flex flex-col gap-1">
                {month.entries.map((entry) => (
                  <SheetRow
                    key={entry.key}
                    entry={entry}
                    locale={locale}
                    people={people}
                  />
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </BottomSheet>
  );
}

function SheetRow({
  entry,
  locale,
  people,
}: {
  entry: ComingUpEntry;
  locale: Locale;
  people: readonly PersonSortable[];
}) {
  const Icon = COMING_UP_ICON[entry.kind] ?? CalendarDays;
  const renewalId = entry.kind === "renewal" ? entry.renewalId : undefined;
  const tappable = !renewalId && isTappableComingUp(entry);
  const detail = tappable ? detailFromComingUp(entry) : null;
  const edge = memberEdgeClass(entry.personId, people);
  const shellClass = `evening-card evening-glass-card ${edge} rounded-[var(--radius-evening-card)] px-3.5 py-3`;

  const body = (
    <div className="flex items-center justify-between gap-3">
      <span className="flex min-w-0 items-center gap-2.5">
        <span
          aria-hidden
          className={`icon-well ${TONE_PILL[COMING_UP_TONE[entry.kind]]}`}
        >
          <Icon size={17} strokeWidth={1.9} />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold leading-snug text-white">
            {entry.title}
          </span>
          <span className="block text-xs leading-relaxed text-slate-muted">
            {entry.note}
          </span>
        </span>
      </span>
      <span className="tnum shrink-0 text-right">
        <span className="block text-sm text-white">
          {formatDate(entry.date, locale)}
        </span>
        <span className="block text-xs text-slate-muted">
          {entry.overdue ? "Overdue" : relativeWhen(entry.daysAway)}
        </span>
      </span>
    </div>
  );

  return (
    <li>
      {tappable && detail ? (
        <ComingUpTappableRow
          detail={detail}
          locale={locale}
          className={`w-full text-left ${shellClass}`}
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
