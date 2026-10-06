import { parseMonthKey } from "@/lib/calendar-month";
import { loadCalendarWindow } from "@/lib/calendar-load";
import { calendarDayParts } from "@/lib/family";
import { requireOnboarded, type Locale } from "@/lib/household";
import { appTitle } from "@/lib/brand";
import CalendarApp from "./CalendarApp";

export const metadata = { title: appTitle("Calendar") };

const DAY_PARAM = /^(\d{4})-(\d{2})-(\d{2})$/;

function first(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function parseDayInMonth(
  value: string | null,
  month: ReturnType<typeof parseMonthKey>
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
  month: ReturnType<typeof parseMonthKey>,
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
  const startAdding = first(params.add) === "1";
  const month = parseMonthKey(first(params.ym));
  const dayParam = first(params.date) ?? first(params.day);

  const payload = await loadCalendarWindow(supabase, household.id, month);

  const todayParts = calendarDayParts();
  const today = `${todayParts.year}-${String(todayParts.month).padStart(2, "0")}-${String(todayParts.day).padStart(2, "0")}`;
  const selectedDay = resolveSelectedDay(dayParam, month, today);

  return (
    <CalendarApp
      householdId={household.id}
      locale={locale}
      initialPayload={payload}
      initialMonth={month}
      initialDay={selectedDay}
      startAdding={startAdding}
    />
  );
}
