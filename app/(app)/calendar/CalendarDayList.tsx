"use client";

import { useState } from "react";
import {
  Backpack,
  Cake,
  CalendarDays,
  GraduationCap,
  Share2,
  type LucideIcon,
} from "lucide-react";
import CalendarEventDetailSheet from "@/components/CalendarEventDetailSheet";
import {
  CALENDAR_KIND_TONE,
  type CalendarItem,
  type CalendarKind,
} from "@/lib/calendar-month";
import {
  detailFromCalendarItem,
  isTappableCalendarItem,
} from "@/lib/calendar-event-detail";
import type { Locale } from "@/lib/household";
import { TONE_PILL } from "@/lib/tones";

const KIND_ICON: Record<CalendarKind, LucideIcon> = {
  birthday: Cake,
  event: CalendarDays,
  school: GraduationCap,
  shared: Share2,
  timetable: Backpack,
};

export default function CalendarDayList({
  items,
  today,
  locale,
}: {
  items: readonly CalendarItem[];
  today: boolean;
  locale: Locale;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<CalendarItem | null>(null);
  const detail = selected ? detailFromCalendarItem(selected) : null;

  function openItem(item: CalendarItem) {
    if (!isTappableCalendarItem(item)) return;
    setSelected(item);
    setOpen(true);
  }

  function close() {
    setOpen(false);
    setSelected(null);
  }

  return (
    <>
      <ul className="-mx-1 flex flex-col gap-1">
        {items.map((item) => {
          const Icon = KIND_ICON[item.kind];
          const tappable = isTappableCalendarItem(item);
          const rowClass = `flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left ${
            today ? "bg-ochre-wash" : ""
          } ${tappable ? "transition-colors hover:bg-navy-wash/70" : ""}`;

          const inner = (
            <>
              <span
                aria-hidden
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-pill ${
                  TONE_PILL[CALENDAR_KIND_TONE[item.kind]]
                }`}
              >
                <Icon size={17} strokeWidth={1.9} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium leading-snug text-ink">
                  {item.title}
                </span>
                <span className="block text-xs leading-relaxed text-ink-faint">
                  {item.note}
                </span>
              </span>
            </>
          );

          return (
            <li key={item.key}>
              {tappable ? (
                <button type="button" className={rowClass} onClick={() => openItem(item)}>
                  {inner}
                </button>
              ) : (
                <div className={rowClass}>{inner}</div>
              )}
            </li>
          );
        })}
      </ul>

      <CalendarEventDetailSheet
        open={open}
        onClose={close}
        detail={detail}
        locale={locale}
      />
    </>
  );
}
