"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Backpack,
  Repeat,
  Cake,
  CalendarDays,
  FileText,
  GraduationCap,
  Share2,
} from "lucide-react";
import CalendarEventDetailSheet from "@/components/CalendarEventDetailSheet";
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
import type { Locale } from "@/lib/household";
import { TONE_PILL } from "@/lib/tones";

const SOON_DAYS = 30;

const COMING_UP_ICON: Record<ComingUpKind, typeof FileText> = {
  document: FileText,
  birthday: Cake,
  event: CalendarDays,
  school: GraduationCap,
  shared: Share2,
  timetable: Backpack,
  routine: Repeat,
};

export default function ComingUpList({
  entries,
  locale,
  headlineKey,
  hiddenCount = 0,
}: {
  entries: readonly ComingUpEntry[];
  locale: Locale;
  headlineKey: string | null;
  hiddenCount?: number;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<ComingUpEntry | null>(null);
  const detail = selected ? detailFromComingUp(selected) : null;
  const months = groupByMonth(entries);
  const showMonths = months.length > 1;

  function openEntry(entry: ComingUpEntry) {
    if (!isTappableComingUp(entry)) return;
    setSelected(entry);
    setOpen(true);
  }

  function close() {
    setOpen(false);
    setSelected(null);
  }

  return (
    <>
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
                  locale={locale}
                  headline={entry.key === headlineKey}
                  onOpen={() => openEntry(entry)}
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

      <CalendarEventDetailSheet
        open={open}
        onClose={close}
        detail={detail}
        locale={locale}
      />
    </>
  );
}

function EntryRow({
  entry,
  locale,
  headline,
  onOpen,
}: {
  entry: ComingUpEntry;
  locale: Locale;
  headline: boolean;
  onOpen: () => void;
}) {
  const soon = entry.daysAway <= SOON_DAYS;
  const Icon = COMING_UP_ICON[entry.kind];
  const tappable = isTappableComingUp(entry);
  const shellClass = `rounded-[var(--radius)] px-3 py-2.5 ${
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
          {countdown(entry.daysAway)}
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
            {relativeWhen(entry.daysAway)}
          </span>
        </span>
      </div>
    </>
  );

  return (
    <li>
      {tappable ? (
        <button type="button" className={`w-full text-left ${shellClass}`} onClick={onOpen}>
          {body}
        </button>
      ) : (
        <div className={shellClass}>{body}</div>
      )}
    </li>
  );
}

function countdown(daysAway: number): string {
  if (daysAway <= 0) return "Coming up today";
  if (daysAway === 1) return "Coming up tomorrow";
  return `Coming up in ${daysAway} days`;
}
