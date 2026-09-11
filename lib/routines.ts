// Recurring household beats. Client-safe shapes + Coming up expansion.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  calendarDayParts,
  daysUntil,
  type FamilyList,
} from "@/lib/family";
import {
  asWeekday,
  WEEKDAY_LABEL,
  type Weekday,
} from "@/lib/timetable";

export const ROUTINE_CADENCES = ["weekly", "fortnightly", "monthly"] as const;
export type RoutineCadence = (typeof ROUTINE_CADENCES)[number];

export const ROUTINE_CADENCE_LABEL: Record<RoutineCadence, string> = {
  weekly: "Every week",
  fortnightly: "Every fortnight",
  monthly: "Every month",
};

export function asRoutineCadence(value: unknown): RoutineCadence | null {
  return (ROUTINE_CADENCES as readonly string[]).includes(value as string)
    ? (value as RoutineCadence)
    : null;
}

export type HouseholdRoutine = {
  id: string;
  title: string;
  cadence: RoutineCadence;
  weekday: Weekday | null;
  day_of_month: number | null;
  anchor_date: string | null;
  notes: string | null;
  active: boolean;
  sort_order: number;
};

export const ROUTINES_SELECT =
  "id, title, cadence, weekday, day_of_month, anchor_date, notes, active, sort_order";

function listOk<T>(items: T[]): FamilyList<T> {
  return { items, fault: null };
}
function listFault<T>(label: string, message: string): FamilyList<T> {
  console.error(`[routines] ${label}`, message);
  return {
    items: [],
    fault: "We couldn’t load this just now. Try refreshing the page.",
  };
}

export async function loadHouseholdRoutines(
  supabase: SupabaseClient,
  householdId: string
): Promise<FamilyList<HouseholdRoutine>> {
  const { data, error } = await supabase
    .from("household_routines")
    .select(ROUTINES_SELECT)
    .eq("household_id", householdId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return listFault("loadHouseholdRoutines", error.message);
  const items = ((data as HouseholdRoutine[] | null) ?? []).map((row) => ({
    ...row,
    cadence: (asRoutineCadence(row.cadence) ?? "weekly") as RoutineCadence,
    weekday: row.weekday == null ? null : asWeekday(row.weekday),
    active: Boolean(row.active),
  }));
  return listOk(items);
}

function isoFromParts(y: number, m: number, d: number): string {
  return new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function weekdayOf(iso: string): Weekday {
  const [y, m, d] = iso.split("-").map(Number);
  const sun0 = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return ((sun0 + 6) % 7) as Weekday;
}

export const ROUTINE_HORIZON_DAYS = 14;

export type RoutineOccurrence = {
  key: string;
  date: string;
  daysAway: number;
  title: string;
  note: string;
};

/** Next occurrences of active routines inside the horizon. */
export function routineComingUpEntries(
  routines: readonly HouseholdRoutine[],
  now: Date = new Date(),
  withinDays: number = ROUTINE_HORIZON_DAYS
): RoutineOccurrence[] {
  const today = calendarDayParts(now);
  const todayIso = isoFromParts(today.year, today.month, today.day);
  const entries: RoutineOccurrence[] = [];

  for (const routine of routines) {
    if (!routine.active) continue;

    for (let offset = 0; offset <= withinDays; offset++) {
      const date = addDays(todayIso, offset);
      let hits = false;

      if (
        (routine.cadence === "weekly" || routine.cadence === "fortnightly") &&
        routine.weekday != null
      ) {
        if (weekdayOf(date) !== routine.weekday) continue;
        if (routine.cadence === "fortnightly") {
          const anchor = routine.anchor_date || todayIso;
          const [ay, am, ad] = anchor.split("-").map(Number);
          const [dy, dm, dd] = date.split("-").map(Number);
          const diff =
            (Date.UTC(dy, dm - 1, dd) - Date.UTC(ay, am - 1, ad)) /
            (24 * 60 * 60 * 1000);
          if (diff < 0 || Math.round(diff) % 14 !== 0) continue;
        }
        hits = true;
      } else if (routine.cadence === "monthly" && routine.day_of_month != null) {
        const day = Number(date.slice(8, 10));
        hits = day === routine.day_of_month;
      }

      if (!hits) continue;
      const daysAway = daysUntil(date, now);
      if (daysAway === null || daysAway < 0) continue;

      const when =
        daysAway === 0
          ? "today"
          : daysAway === 1
            ? "tomorrow"
            : routine.weekday != null
              ? WEEKDAY_LABEL[routine.weekday]
              : ROUTINE_CADENCE_LABEL[routine.cadence];

      entries.push({
        key: `routine-${routine.id}-${date}`,
        date,
        daysAway,
        title: routine.title,
        note: [when, routine.notes].filter(Boolean).join(" · "),
      });
    }
  }

  return entries.sort(
    (a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title)
  );
}
