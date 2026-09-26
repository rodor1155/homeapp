"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import {
  calendarItemKey,
  parseCalendarEventRef,
} from "@/lib/coming-up";
import type { HouseholdPerson } from "@/lib/family";
import type { Locale } from "@/lib/household";
import {
  memberColourStyle,
  personColourById,
} from "@/lib/member-colours";
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
  people,
  today,
  locale,
  monthParam,
  initialOpenKey = null,
}: {
  items: readonly CalendarItem[];
  people: readonly HouseholdPerson[];
  today: boolean;
  locale: Locale;
  monthParam: string;
  /** Opens this item without a `?event=` URL (preview / storybook). */
  initialOpenKey?: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const deepLinkItem = useMemo(() => {
    if (initialOpenKey) {
      const match = items.find((item) => item.key === initialOpenKey);
      if (match && isTappableCalendarItem(match)) return match;
    }
    const ref = parseCalendarEventRef(searchParams.get("event"));
    if (!ref) return null;
    const match = items.find((item) => item.key === calendarItemKey(ref));
    if (!match || !isTappableCalendarItem(match)) return null;
    return match;
  }, [initialOpenKey, items, searchParams]);

  const [picked, setPicked] = useState<CalendarItem | null>(null);
  const [deepLinkDismissed, setDeepLinkDismissed] = useState(false);

  const selected =
    picked ??
    (!deepLinkDismissed && deepLinkItem ? deepLinkItem : null);
  const open = selected !== null;
  const detail = selected ? detailFromCalendarItem(selected) : null;

  const stripEventParam = useCallback(() => {
    if (!searchParams.get("event")) return;
    const next = new URLSearchParams(searchParams.toString());
    next.delete("event");
    const qs = next.toString();
    router.replace(qs ? `/calendar?${qs}` : `/calendar?ym=${monthParam}`, {
      scroll: false,
    });
  }, [monthParam, router, searchParams]);

  const openItem = useCallback((item: CalendarItem) => {
    if (!isTappableCalendarItem(item)) return;
    setPicked(item);
  }, []);

  const close = useCallback(() => {
    setPicked(null);
    setDeepLinkDismissed(true);
    stripEventParam();
  }, [stripEventParam]);

  useEffect(() => {
    if (searchParams.get("event") && !deepLinkItem) stripEventParam();
  }, [deepLinkItem, searchParams, stripEventParam]);

  return (
    <>
      <ul className="-mx-1 flex flex-col gap-1">
        {items.map((item) => {
          const Icon = KIND_ICON[item.kind];
          const tappable = isTappableCalendarItem(item);
          const memberColour = personColourById(item.personId, people);
          const rowClass = `flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left ${
            today ? "bg-ochre-wash" : ""
          } ${memberColour ? "calendar-member-edge pl-2" : ""} ${
            tappable ? "transition-colors hover:bg-navy-wash/70" : ""
          }`;

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

          const memberStyle = memberColour
            ? memberColourStyle(memberColour)
            : undefined;

          return (
            <li key={item.key}>
              {tappable ? (
                <button
                  type="button"
                  className={rowClass}
                  style={memberStyle}
                  onClick={() => openItem(item)}
                >
                  {inner}
                </button>
              ) : (
                <div className={rowClass} style={memberStyle}>
                  {inner}
                </div>
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
