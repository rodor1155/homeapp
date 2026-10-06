"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type TouchEvent,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import {
  CALENDAR_KIND_LABEL,
  CALENDAR_KIND_TONE,
  CALENDAR_KINDS,
  currentMonth,
  itemsByDate,
  monthDays,
  monthParam,
  parseMonthKey,
  sameMonth,
  shiftMonth,
  type CalendarItem,
  type MonthKey,
} from "@/lib/calendar-month";
import { buildCalendarItemsForMonth } from "@/lib/calendar-items";
import type { CalendarWindowPayload } from "@/lib/calendar-payload";
import {
  mergeIntoCalendarCache,
  readCalendarCache,
  writeCalendarCache,
} from "@/lib/calendar-cache";
import {
  adjacentWindow,
  calendarWindowForAnchor,
  isMonthInWindow,
  shouldPrefetchNextWindow,
  type CalendarWindowRange,
} from "@/lib/calendar-window";
import {
  formatMonth,
  formatWeekdayDate,
  weekdayLabels,
  weekStartsOn,
} from "@/lib/dates";
import { calendarDayParts } from "@/lib/family";
import type { Locale } from "@/lib/household";
import { TONE_DOT, TONE_WASH } from "@/lib/tones";
import AddDateCard from "./AddDateCard";
import CalendarDayList from "./CalendarDayList";
import SharedCalendarsPanel from "./SharedCalendarsPanel";

const DAY_PARAM = /^(\d{4})-(\d{2})-(\d{2})$/;
const PULL_THRESHOLD_PX = 64;
const PULL_MAX_PX = 96;

function parseDayInMonth(
  value: string | null,
  month: MonthKey
): string | null {
  const match = DAY_PARAM.exec((value ?? "").trim());
  if (!match) return null;
  const year = Number(match[1]);
  const monthNum = Number(match[2]);
  const day = Number(match[3]);
  if (year !== month.year || monthNum !== month.month) return null;
  if (day < 1 || day > 31) return null;
  const iso = `${match[1]}-${match[2]}-${match[3]}`;
  const at = new Date(Date.UTC(year, monthNum - 1, day));
  if (
    at.getUTCFullYear() !== year ||
    at.getUTCMonth() !== monthNum - 1 ||
    at.getUTCDate() !== day
  ) {
    return null;
  }
  return iso;
}

function resolveSelectedDay(
  dayParam: string | null,
  month: MonthKey,
  today: string
): string | null {
  const fromUrl = parseDayInMonth(dayParam, month);
  if (fromUrl) return fromUrl;
  if (parseDayInMonth(today, month)) return today;
  return null;
}

function windowFromPayload(payload: CalendarWindowPayload): CalendarWindowRange {
  const anchor = parseMonthKey(payload.window.anchorYm);
  return calendarWindowForAnchor(anchor);
}

function replaceCalendarUrl(
  month: MonthKey,
  day: string | null,
  extra?: { event?: string | null; add?: boolean }
) {
  const params = new URLSearchParams();
  params.set("ym", monthParam(month));
  if (day) params.set("day", day);
  if (extra?.event) params.set("event", extra.event);
  if (extra?.add) params.set("add", "1");
  const qs = params.toString();
  window.history.replaceState(null, "", `/calendar?${qs}`);
}

export default function CalendarApp({
  householdId,
  locale,
  initialPayload,
  initialMonth,
  initialDay,
  startAdding,
}: {
  householdId: string;
  locale: Locale;
  initialPayload: CalendarWindowPayload;
  initialMonth: MonthKey;
  initialDay: string | null;
  startAdding: boolean;
}) {
  const router = useRouter();
  const [payload, setPayload] = useState(() => {
    const cached = readCalendarCache(householdId);
    return cached?.payload ?? initialPayload;
  });
  const [viewMonth, setViewMonth] = useState(initialMonth);
  const [selectedDay, setSelectedDay] = useState(initialDay);
  const [refreshing, setRefreshing] = useState(false);
  const [pullOffset, setPullOffset] = useState(0);
  const [pullDragging, setPullDragging] = useState(false);
  const [syncedFetchedAt, setSyncedFetchedAt] = useState(initialPayload.fetchedAt);

  if (initialPayload.fetchedAt !== syncedFetchedAt) {
    setSyncedFetchedAt(initialPayload.fetchedAt);
    setPayload(initialPayload);
    writeCalendarCache(householdId, initialPayload);
  }

  const windowRange = useMemo(() => windowFromPayload(payload), [payload]);
  const prefetching = useRef(false);
  const pullStartY = useRef<number | null>(null);

  const todayParts = calendarDayParts();
  const today = `${todayParts.year}-${String(todayParts.month).padStart(2, "0")}-${String(todayParts.day).padStart(2, "0")}`;

  const fetchWindow = useCallback(
    async (ym: string, merge: boolean) => {
      try {
        const res = await fetch(`/api/calendar/window?ym=${encodeURIComponent(ym)}`);
        if (!res.ok) return;
        const data = (await res.json()) as CalendarWindowPayload;
        setPayload(() => {
          const next = merge ? mergeIntoCalendarCache(householdId, data) : data;
          writeCalendarCache(householdId, next);
          return next;
        });
      } catch {
        /* offline */
      }
    },
    [householdId]
  );

  const ensureMonthInWindow = useCallback(
    async (month: MonthKey) => {
      if (isMonthInWindow(month, windowRange)) return;
      await fetchWindow(monthParam(month), true);
    },
    [fetchWindow, windowRange]
  );

  const maybePrefetchEdges = useCallback(
    (month: MonthKey) => {
      const edge = shouldPrefetchNextWindow(month, windowRange);
      if (!edge || prefetching.current) return;
      prefetching.current = true;
      const next = adjacentWindow(windowRange, edge);
      void fetchWindow(monthParam(next.anchor), true).finally(() => {
        prefetching.current = false;
      });
    },
    [fetchWindow, windowRange]
  );

  const goToMonth = useCallback(
    (month: MonthKey, dayOverride?: string | null) => {
      setViewMonth(month);
      const day =
        dayOverride !== undefined
          ? dayOverride
          : resolveSelectedDay(null, month, today);
      setSelectedDay(day);
      replaceCalendarUrl(month, day);
      void ensureMonthInWindow(month);
      maybePrefetchEdges(month);
    },
    [ensureMonthInWindow, maybePrefetchEdges, today]
  );

  const selectDay = useCallback(
    (day: string) => {
      setSelectedDay(day);
      replaceCalendarUrl(viewMonth, day);
    },
    [viewMonth]
  );

  useEffect(() => {
    const onPop = () => {
      const params = new URLSearchParams(window.location.search);
      const month = parseMonthKey(params.get("ym"));
      const day = resolveSelectedDay(
        params.get("date") ?? params.get("day"),
        month,
        today
      );
      setViewMonth(month);
      setSelectedDay(day);
      void ensureMonthInWindow(month);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [ensureMonthInWindow, today]);

  useEffect(() => {
    maybePrefetchEdges(viewMonth);
  }, [maybePrefetchEdges, viewMonth]);

  const raw = payload;
  const items = useMemo(
    () => buildCalendarItemsForMonth(raw, viewMonth),
    [raw, viewMonth]
  );
  const byDate = useMemo(() => itemsByDate(items), [items]);
  const label = formatMonth(monthParam(viewMonth), locale);
  const dayItems = selectedDay ? byDate.get(selectedDay) ?? [] : [];
  const ym = monthParam(viewMonth);
  const bounds = useMemo(() => {
    const prefix = monthParam(viewMonth);
    const lastDay = new Date(Date.UTC(viewMonth.year, viewMonth.month, 0)).getUTCDate();
    return {
      from: `${prefix}-01`,
      to: `${prefix}-${String(lastDay).padStart(2, "0")}`,
    };
  }, [viewMonth]);

  const onPullStart = (event: TouchEvent<HTMLDivElement>) => {
    if (refreshing) return;
    if (window.scrollY > 0) return;
    pullStartY.current = event.touches[0]?.clientY ?? null;
    setPullDragging(true);
  };

  const onPullMove = (event: TouchEvent<HTMLDivElement>) => {
    if (pullStartY.current == null || refreshing) return;
    if (window.scrollY > 0) {
      pullStartY.current = null;
      setPullDragging(false);
      setPullOffset(0);
      return;
    }
    const y = event.touches[0]?.clientY ?? pullStartY.current;
    const delta = Math.max(0, y - pullStartY.current);
    setPullOffset(Math.min(PULL_MAX_PX, delta * 0.45));
  };

  const onPullEnd = () => {
    if (!pullDragging) return;
    const shouldRefresh = pullOffset >= PULL_THRESHOLD_PX && !refreshing;
    if (!shouldRefresh) {
      pullStartY.current = null;
      setPullDragging(false);
      setPullOffset(0);
      return;
    }
    setRefreshing(true);
    setPullDragging(false);
    void fetchWindow(ym, false).finally(() => {
      router.refresh();
      setRefreshing(false);
      setPullOffset(0);
      pullStartY.current = null;
    });
  };

  const pullLabel = refreshing
    ? "Refreshing…"
    : pullOffset >= PULL_THRESHOLD_PX
      ? "Release to refresh"
      : pullOffset > 12
        ? "Pull to refresh"
        : "";

  return (
    <div
      className="relative"
      onTouchStart={onPullStart}
      onTouchMove={onPullMove}
      onTouchEnd={onPullEnd}
      onTouchCancel={() => {
        pullStartY.current = null;
        setPullDragging(false);
        setPullOffset(0);
      }}
    >
      <div
        aria-hidden={pullOffset < 8 && !refreshing}
        className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center"
        style={{
          transform: `translateY(${Math.max(0, pullOffset - 28)}px)`,
          opacity: pullOffset > 8 || refreshing ? 1 : 0,
          transition: pullDragging ? "none" : "opacity 150ms ease",
        }}
      >
        <span className="rounded-pill bg-paper-raised/95 px-3 py-1 text-xs font-medium text-ink-soft shadow-sm ring-1 ring-rule">
          {pullLabel || "Pull to refresh"}
        </span>
      </div>

      <div
        className="flex flex-col gap-4"
        style={{
          transform: pullOffset ? `translateY(${pullOffset}px)` : undefined,
          transition: pullDragging ? "none" : "transform 180ms ease",
        }}
      >
        {payload.loadFault ? (
          <p
            role="status"
            className="rounded border border-oxblood/30 bg-oxblood-tint px-3 py-2 text-sm text-oxblood"
          >
            {payload.loadFault}
          </p>
        ) : null}

        <div className="flex items-end justify-between gap-3 px-1">
          <div className="min-w-0">
            <h1 className="text-2xl">Calendar</h1>
            <p className="mt-0.5 text-sm text-ink-soft">
              Birthdays, the dates you typed in, the schools&rsquo; own terms and
              any calendar you share, all on one month.
            </p>
          </div>
          {sameMonth(viewMonth, currentMonth()) ? null : (
            <button
              type="button"
              className="text-action shrink-0 text-sm"
              onClick={() => goToMonth(currentMonth(), today)}
            >
              Today
            </button>
          )}
        </div>

        <Card padding="none">
          <MonthBar
            month={viewMonth}
            label={label}
            locale={locale}
            onMonth={goToMonth}
          />
          <Grid
            month={viewMonth}
            byDate={byDate}
            today={today}
            selectedDay={selectedDay}
            locale={locale}
            onSelectDay={selectDay}
          />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-rule px-4 py-3 text-xs text-ink-faint">
            {CALENDAR_KINDS.map((kind) => (
              <span key={kind} className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className={`h-1.5 w-1.5 rounded-pill ${
                    TONE_DOT[CALENDAR_KIND_TONE[kind]]
                  }`}
                />
                {CALENDAR_KIND_LABEL[kind]}
              </span>
            ))}
          </div>
        </Card>

        <Card
          title={
            selectedDay
              ? `${selectedDay === today ? "Today · " : ""}${formatWeekdayDate(selectedDay, locale)}`
              : label
          }
          action={
            selectedDay && dayItems.length > 0 ? (
              <span className="tnum text-xs text-ink-faint">
                {dayItems.length} {dayItems.length === 1 ? "date" : "dates"}
              </span>
            ) : undefined
          }
        >
          {!selectedDay ? (
            <p className="text-sm text-ink-faint">
              Tap a day to see what&rsquo;s on.
            </p>
          ) : dayItems.length === 0 ? (
            <p className="text-sm text-ink-faint">
              Nothing on this day. Birthdays come from the family, and a
              school&rsquo;s terms come from its own calendar.
            </p>
          ) : (
            <CalendarDayList
              items={dayItems}
              people={raw.people}
              today={selectedDay === today}
              locale={locale}
              monthParam={ym}
            />
          )}
        </Card>

        <AddDateCard
          people={raw.people}
          defaultDate={selectedDay ?? bounds.from}
          monthLabel={label}
          startAdding={startAdding}
        />

        <Card
          title="Shared calendars"
          action={
            raw.calendars.length > 0 ? (
              <span className="tnum text-xs text-ink-faint">
                {raw.calendars.length}{" "}
                {raw.calendars.length === 1 ? "calendar" : "calendars"}
              </span>
            ) : undefined
          }
        >
          <SharedCalendarsPanel
            calendars={raw.calendars}
            events={raw.sharedDates}
            locale={locale}
          />
        </Card>

        <p className="px-1 pt-2 text-center text-xs text-ink-faint">
          Birthdays come from the people on{" "}
          <Link href="/family" className="text-action text-xs">
            Family
          </Link>
          . Term dates and shared calendars are read from their own links, about
          four months ahead.
        </p>
      </div>
    </div>
  );
}

function MonthBar({
  month,
  label,
  locale,
  onMonth,
}: {
  month: MonthKey;
  label: string;
  locale: Locale;
  onMonth: (month: MonthKey) => void;
}) {
  const previous = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);

  return (
    <div className="flex items-center justify-between gap-2 border-b border-rule px-2 py-2">
      <MonthArrow
        month={previous}
        locale={locale}
        direction="back"
        onMonth={onMonth}
      />
      <h2 className="text-base font-semibold text-ink">{label}</h2>
      <MonthArrow
        month={next}
        locale={locale}
        direction="on"
        onMonth={onMonth}
      />
    </div>
  );
}

function MonthArrow({
  month,
  locale,
  direction,
  onMonth,
}: {
  month: MonthKey;
  locale: Locale;
  direction: "back" | "on";
  onMonth: (month: MonthKey) => void;
}) {
  const Icon = direction === "back" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      aria-label={`Show ${formatMonth(monthParam(month), locale)}`}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-navy-tint hover:text-ink"
      onClick={() => onMonth(month)}
    >
      <Icon size={18} strokeWidth={1.9} aria-hidden />
    </button>
  );
}

function Grid({
  month,
  byDate,
  today,
  selectedDay,
  locale,
  onSelectDay,
}: {
  month: MonthKey;
  byDate: Map<string, CalendarItem[]>;
  today: string;
  selectedDay: string | null;
  locale: Locale;
  onSelectDay: (day: string) => void;
}) {
  const days = monthDays(month, weekStartsOn(locale));

  return (
    <div className="px-2 pb-3 pt-2">
      <div className="grid grid-cols-7 pb-1">
        {weekdayLabels(locale).map((name) => (
          <span
            key={name}
            className="text-center text-xs font-medium text-ink-faint"
          >
            {name}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {days.map((day) => {
          const kinds = CALENDAR_KINDS.filter((kind) =>
            (byDate.get(day.date) ?? []).some((item) => item.kind === kind)
          );
          const marked = kinds.length > 0 && day.inMonth;
          const isToday = day.date === today;
          const isSelected = day.inMonth && day.date === selectedDay;
          const wash =
            marked && !isSelected ? TONE_WASH[CALENDAR_KIND_TONE[kinds[0]]] : "";

          const cellClass = `flex aspect-square flex-col items-center justify-center gap-1 rounded-lg text-sm ${wash} ${
            day.inMonth ? "text-ink" : "text-ink-faint opacity-60"
          } ${
            isSelected
              ? "bg-navy-tint font-semibold ring-2 ring-inset ring-navy"
              : isToday
                ? "ring-1 ring-inset ring-navy"
                : ""
          } ${day.inMonth ? "transition-colors hover:bg-navy-tint/60" : ""}`;

          const inner = (
            <>
              <span className={`tnum ${isToday || isSelected ? "font-semibold" : ""}`}>
                {day.day}
              </span>
              <span aria-hidden className="flex h-1.5 items-center gap-0.5">
                {marked
                  ? kinds.map((kind) => (
                      <span
                        key={kind}
                        className={`h-1.5 w-1.5 rounded-pill ${
                          TONE_DOT[CALENDAR_KIND_TONE[kind]]
                        }`}
                      />
                    ))
                  : null}
              </span>
            </>
          );

          if (!day.inMonth) {
            return (
              <div key={day.date} className={cellClass}>
                {inner}
              </div>
            );
          }

          return (
            <button
              key={day.date}
              type="button"
              aria-label={formatWeekdayDate(day.date, locale)}
              aria-current={isSelected ? "date" : undefined}
              className={cellClass}
              onClick={() => onSelectDay(day.date)}
            >
              {inner}
            </button>
          );
        })}
      </div>
    </div>
  );
}
