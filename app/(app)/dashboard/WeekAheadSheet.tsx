"use client";

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
import BottomSheet from "@/components/BottomSheet";
import {
  COMING_UP_TONE,
  comingUpHref,
  type ComingUpEntry,
} from "@/lib/coming-up";
import { formatDate, formatEventTime } from "@/lib/dates";
import { memberEdgeClass, type PersonSortable } from "@/lib/evening-map";
import type { Locale } from "@/lib/household";
import { TONE_PILL } from "@/lib/tones";
import type { WeekAheadModel } from "@/lib/week-ahead";

function personNameForEntry(
  entry: ComingUpEntry,
  people: readonly PersonSortable[]
): string | null {
  if (!entry.personId) return null;
  const person = people.find((p) => p.id === entry.personId);
  if (person && "name" in person && typeof person.name === "string") {
    return person.name;
  }
  const tail = entry.note.split(" · ").pop();
  return tail?.trim() || null;
}

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

export default function WeekAheadSheet({
  open,
  onClose,
  model,
  people,
  locale,
}: {
  open: boolean;
  onClose: () => void;
  model: WeekAheadModel;
  people: readonly PersonSortable[];
  locale: Locale;
}) {
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Your week ahead"
      subtitle={model.rangeLabel}
      className="evening-sheet week-ahead-sheet"
      footer={
        <Link
          href={model.calendarHref}
          className="week-ahead-sheet-open-btn btn-accent w-full"
          onClick={onClose}
        >
          Open calendar
        </Link>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm font-medium text-ink">{model.headline}</p>

        {model.days.map((day) => (
          <section key={day.date}>
            <h3 className="pb-1 text-xs font-semibold uppercase tracking-wide text-slate-muted">
              {day.weekdayLabel} · {formatDate(day.date, locale)}
            </h3>
            {day.entries.length > 0 ? (
              <ul className="flex flex-col gap-1">
                {day.entries.map((entry) => (
                  <SheetRow
                    key={entry.key}
                    entry={entry}
                    people={people}
                    locale={locale}
                    onNavigate={onClose}
                  />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-muted">Nothing planned</p>
            )}
          </section>
        ))}

        {model.totalCount === 0 ? (
          <p className="text-sm text-slate-muted">Nothing planned this week.</p>
        ) : null}
      </div>
    </BottomSheet>
  );
}

function sheetMeta(
  entry: ComingUpEntry,
  people: readonly PersonSortable[]
): string {
  const person = personNameForEntry(entry, people);
  if (!person) return entry.note;

  const parts = entry.note.split(" · ").filter(Boolean);
  const kindPart =
    parts.find((part) => part !== person) ?? parts[0] ?? entry.note;
  return `${person} · ${kindPart}`;
}

function weekSheetWhen(entry: ComingUpEntry, locale: Locale): string {
  if (entry.overdue) return "Overdue";
  if (entry.startsAt) return formatEventTime(entry.startsAt, locale);
  return "All day";
}

function SheetRow({
  entry,
  people,
  locale,
  onNavigate,
}: {
  entry: ComingUpEntry;
  people: readonly PersonSortable[];
  locale: Locale;
  onNavigate: () => void;
}) {
  const Icon = COMING_UP_ICON[entry.kind] ?? CalendarDays;
  const href = comingUpHref(entry);
  const edge = memberEdgeClass(entry.personId, people);
  const shellClass = `coming-up-member-edge block overflow-hidden rounded-[var(--radius)] ${edge} transition-colors hover:bg-navy-wash/70`;

  const body = (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5">
      <span className="flex min-w-0 items-center gap-2.5">
        <span
          aria-hidden
          className={`icon-well ${TONE_PILL[COMING_UP_TONE[entry.kind]]}`}
        >
          <Icon size={17} strokeWidth={1.9} />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold leading-snug text-map-text">
            {entry.title}
          </span>
          <span className="block truncate text-xs leading-relaxed text-slate-muted">
            {sheetMeta(entry, people)}
          </span>
        </span>
      </span>
      <span className="tnum shrink-0 text-right text-xs text-slate-muted">
        {weekSheetWhen(entry, locale)}
      </span>
    </div>
  );

  return (
    <li>
      {href ? (
        <Link href={href} className={shellClass} onClick={onNavigate}>
          {body}
        </Link>
      ) : (
        <div className={shellClass}>{body}</div>
      )}
    </li>
  );
}
