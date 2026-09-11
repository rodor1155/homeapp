import Link from "next/link";
import {
  Cake,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  Share2,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui";
import {
  birthdayItems,
  CALENDAR_KIND_LABEL,
  CALENDAR_KIND_TONE,
  CALENDAR_KINDS,
  currentMonth,
  eventItems,
  itemsByDate,
  monthBounds,
  monthDays,
  monthParam,
  parseMonthKey,
  sameMonth,
  schoolItems,
  sharedItems,
  shiftMonth,
  sortItems,
  type CalendarItem,
  type CalendarKind,
  type MonthKey,
} from "@/lib/calendar-month";
import {
  formatMonth,
  formatWeekdayDate,
  weekdayLabels,
  weekStartsOn,
} from "@/lib/dates";
import {
  calendarDayParts,
  firstFault,
  loadHouseholdCalendarEventsBetween,
  loadHouseholdCalendars,
  loadHouseholdEvents,
  loadHouseholdPeople,
  loadSchoolCalendarEventsBetween,
  loadSchools,
} from "@/lib/family";
import { requireOnboarded, type Locale } from "@/lib/household";
import { TONE_DOT, TONE_PILL, TONE_WASH } from "@/lib/tones";
import AddDateCard from "./AddDateCard";
import SharedCalendarsPanel from "./SharedCalendarsPanel";

export const metadata = { title: "Calendar · homeapp" };

/* The household's month: the birthdays it derives, the dates someone typed in,
   whatever the schools' feeds say and whatever the household's own linked
   calendars do, on one grid. A month is a URL (`?ym=2026-10`), and a day is
   too (`?day=2026-10-14`), so the back button works and a day can be shared.

   Colour is the only thing telling the four apart, and it comes from
   lib/tones.ts through each kind's tone — never a class written here. */

const KIND_ICON: Record<CalendarKind, LucideIcon> = {
  birthday: Cake,
  event: CalendarDays,
  school: GraduationCap,
  shared: Share2,
};

const DAY_PARAM = /^(\d{4})-(\d{2})-(\d{2})$/;

function first(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

/** A `?day=YYYY-MM-DD` value that falls in the visible month, or null. */
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
  // Reject nonsense like 2026-02-31 by round-tripping through Date.UTC.
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

/**
 * The day the list under the grid shows: the URL's day when it is in this
 * month; otherwise today when today is in this month; otherwise nothing, so
 * the empty state asks them to tap a day.
 */
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

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { supabase, household } = await requireOnboarded();
  const locale: Locale = household.locale ?? "UK";

  const params = await searchParams;
  const month = parseMonthKey(first(params.ym));
  const bounds = monthBounds(month);

  const fromIso = `${bounds.from}T00:00:00.000Z`;
  const toIso = `${bounds.to}T23:59:59.999Z`;

  const [
    peopleLoad,
    schoolsLoad,
    eventsLoad,
    schoolDatesLoad,
    calendarsLoad,
    sharedDatesLoad,
  ] = await Promise.all([
    loadHouseholdPeople(supabase, household.id),
    loadSchools(supabase, household.id),
    loadHouseholdEvents(supabase, household.id),
    loadSchoolCalendarEventsBetween(supabase, household.id, fromIso, toIso),
    loadHouseholdCalendars(supabase, household.id),
    loadHouseholdCalendarEventsBetween(supabase, household.id, fromIso, toIso),
  ]);

  const people = peopleLoad.items;
  const schools = schoolsLoad.items;
  const events = eventsLoad.items;
  const schoolDates = schoolDatesLoad.items;
  const calendars = calendarsLoad.items;
  const sharedDates = sharedDatesLoad.items;
  const loadFault = firstFault(
    peopleLoad,
    schoolsLoad,
    eventsLoad,
    schoolDatesLoad,
    calendarsLoad,
    sharedDatesLoad
  );

  const items = sortItems([
    ...birthdayItems(people, month),
    ...eventItems(events, people, month),
    ...schoolItems(schoolDates, schools, month, people),
    ...sharedItems(sharedDates, calendars, month),
  ]);

  const byDate = itemsByDate(items);
  const todayParts = calendarDayParts();
  const today = `${todayParts.year}-${String(todayParts.month).padStart(2, "0")}-${String(todayParts.day).padStart(2, "0")}`;
  const label = formatMonth(monthParam(month), locale);
  const selectedDay = resolveSelectedDay(first(params.day), month, today);
  const dayItems = selectedDay ? byDate.get(selectedDay) ?? [] : [];

  return (
    <div className="flex flex-col gap-4">
      {loadFault ? (
        <p
          role="status"
          className="rounded border border-oxblood/30 bg-oxblood-tint px-3 py-2 text-sm text-oxblood"
        >
          {loadFault}
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
        {sameMonth(month, currentMonth()) ? null : (
          <Link href="/calendar" className="text-action shrink-0 text-sm">
            Today
          </Link>
        )}
      </div>

      <Card padding="none">
        <MonthBar month={month} label={label} locale={locale} />
        <Grid
          month={month}
          byDate={byDate}
          today={today}
          selectedDay={selectedDay}
          locale={locale}
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
          <ul className="-mx-1 flex flex-col gap-1">
            {dayItems.map((item) => (
              <Row
                key={item.key}
                item={item}
                today={selectedDay === today}
              />
            ))}
          </ul>
        )}
      </Card>

      <AddDateCard
        people={people}
        defaultDate={selectedDay ?? bounds.from}
        monthLabel={label}
      />

      <Card
        title="Shared calendars"
        action={
          calendars.length > 0 ? (
            <span className="tnum text-xs text-ink-faint">
              {calendars.length}{" "}
              {calendars.length === 1 ? "calendar" : "calendars"}
            </span>
          ) : undefined
        }
      >
        <SharedCalendarsPanel
          calendars={calendars}
          events={sharedDates}
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
  );
}

function MonthBar({
  month,
  label,
  locale,
}: {
  month: MonthKey;
  label: string;
  locale: Locale;
}) {
  const previous = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);

  return (
    <div className="flex items-center justify-between gap-2 border-b border-rule px-2 py-2">
      <MonthArrow month={previous} locale={locale} direction="back" />
      <h2 className="text-base font-semibold text-ink">{label}</h2>
      <MonthArrow month={next} locale={locale} direction="on" />
    </div>
  );
}

function MonthArrow({
  month,
  locale,
  direction,
}: {
  month: MonthKey;
  locale: Locale;
  direction: "back" | "on";
}) {
  const Icon = direction === "back" ? ChevronLeft : ChevronRight;
  // Drop `day` when changing months — the selected day belongs to the month
  // it came from, and resolving to today (when in range) is quieter.
  return (
    <Link
      href={`/calendar?ym=${monthParam(month)}`}
      aria-label={`Show ${formatMonth(monthParam(month), locale)}`}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-navy-tint hover:text-ink"
    >
      <Icon size={18} strokeWidth={1.9} aria-hidden />
    </Link>
  );
}

/** The month as squares. Each in-month day is a link; the list under the
 *  grid shows only the selected day. */
function Grid({
  month,
  byDate,
  today,
  selectedDay,
  locale,
}: {
  month: MonthKey;
  byDate: Map<string, CalendarItem[]>;
  today: string;
  selectedDay: string | null;
  locale: Locale;
}) {
  const days = monthDays(month, weekStartsOn(locale));
  const ym = monthParam(month);

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
          // A busy day takes the wash of its first kind, so the month reads
          // as colour from arm's length and the dots say the rest. Selected
          // wins over wash so the tap target stays obvious.
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
            <Link
              key={day.date}
              href={`/calendar?ym=${ym}&day=${day.date}`}
              aria-label={formatWeekdayDate(day.date, locale)}
              aria-current={isSelected ? "date" : undefined}
              className={cellClass}
            >
              {inner}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function Row({ item, today }: { item: CalendarItem; today: boolean }) {
  const Icon = KIND_ICON[item.kind];
  return (
    <li
      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 ${
        today ? "bg-ochre-wash" : ""
      }`}
    >
      <span
        aria-hidden
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-pill ${
          TONE_PILL[CALENDAR_KIND_TONE[item.kind]]
        }`}
      >
        <Icon size={17} strokeWidth={1.9} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-ink">
          {item.title}
        </span>
        <span className="block truncate text-xs text-ink-faint">
          {item.note}
        </span>
      </span>
    </li>
  );
}
