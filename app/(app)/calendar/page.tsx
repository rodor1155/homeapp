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
   calendars do, on one grid. A month is a URL (`?ym=2026-10`), so the back
   button works and a month can be shared.

   Colour is the only thing telling the four apart, and it comes from
   lib/tones.ts through each kind's tone — never a class written here. */

const KIND_ICON: Record<CalendarKind, LucideIcon> = {
  birthday: Cake,
  event: CalendarDays,
  school: GraduationCap,
  shared: Share2,
};

function first(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { supabase, household } = await requireOnboarded();
  const locale: Locale = household.locale ?? "UK";

  const month = parseMonthKey(first((await searchParams).ym));
  const bounds = monthBounds(month);

  const fromIso = `${bounds.from}T00:00:00.000Z`;
  const toIso = `${bounds.to}T23:59:59.999Z`;

  const [
    people,
    schools,
    events,
    schoolDates,
    calendars,
    sharedDates,
  ] = await Promise.all([
    loadHouseholdPeople(supabase, household.id),
    loadSchools(supabase, household.id),
    loadHouseholdEvents(supabase, household.id),
    loadSchoolCalendarEventsBetween(supabase, household.id, fromIso, toIso),
    loadHouseholdCalendars(supabase, household.id),
    loadHouseholdCalendarEventsBetween(supabase, household.id, fromIso, toIso),
  ]);

  const items = sortItems([
    ...birthdayItems(people, month),
    ...eventItems(events, people, month),
    ...schoolItems(schoolDates, schools, month),
    ...sharedItems(sharedDates, calendars, month),
  ]);

  const byDate = itemsByDate(items);
  const today = new Date().toISOString().slice(0, 10);
  const label = formatMonth(monthParam(month), locale);

  return (
    <div className="flex flex-col gap-4">
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
        title={label}
        action={
          items.length > 0 ? (
            <span className="tnum text-xs text-ink-faint">
              {items.length} {items.length === 1 ? "date" : "dates"}
            </span>
          ) : undefined
        }
      >
        {items.length === 0 ? (
          <p className="text-sm text-ink-faint">
            Nothing on in {label}. Birthdays come from the family, and a
            school&rsquo;s terms come from its own calendar.
          </p>
        ) : (
          <div className="-mx-1 flex flex-col gap-3.5">
            {[...byDate.entries()].map(([date, dayItems]) => (
              <div key={date}>
                <h3 className="px-2.5 pb-1 text-xs font-semibold uppercase tracking-wide text-ink-faint">
                  {date === today ? "Today · " : ""}
                  {formatWeekdayDate(date, locale)}
                </h3>
                <ul className="flex flex-col gap-1">
                  {dayItems.map((item) => (
                    <Row key={item.key} item={item} today={date === today} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>

      <AddDateCard
        people={people}
        defaultDate={bounds.from}
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

/** The month as squares. Display only — the list under it is the readable
 *  copy of the same thing, so a day needs no tap target of its own. */
function Grid({
  month,
  byDate,
  today,
  locale,
}: {
  month: MonthKey;
  byDate: Map<string, CalendarItem[]>;
  today: string;
  locale: Locale;
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
          // A busy day takes the wash of its first kind, so the month reads
          // as colour from arm's length and the dots say the rest.
          const wash = marked ? TONE_WASH[CALENDAR_KIND_TONE[kinds[0]]] : "";

          return (
            <div
              key={day.date}
              className={`flex aspect-square flex-col items-center justify-center gap-1 rounded-lg text-sm ${wash} ${
                day.inMonth ? "text-ink" : "text-ink-faint opacity-60"
              } ${day.date === today ? "ring-1 ring-inset ring-navy" : ""}`}
            >
              <span
                className={`tnum ${day.date === today ? "font-semibold" : ""}`}
              >
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
            </div>
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
