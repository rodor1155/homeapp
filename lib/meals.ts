// Light Mon–Sun dinner plan for the current week. Client-safe.

import type { SupabaseClient } from "@supabase/supabase-js";
import { calendarDayParts, type FamilyList } from "@/lib/family";
import { asWeekday, WEEKDAY_LABEL, type Weekday } from "@/lib/timetable";

export type MealPlan = {
  id: string;
  week_start: string;
  weekday: Weekday;
  title: string;
  ingredients_note: string | null;
  sort_order: number;
};

export const MEALS_SELECT =
  "id, week_start, weekday, title, ingredients_note, sort_order";

function listOk<T>(items: T[]): FamilyList<T> {
  return { items, fault: null };
}
function listFault<T>(label: string, message: string): FamilyList<T> {
  console.error(`[meals] ${label}`, message);
  return {
    items: [],
    fault: "We couldn’t load this just now. Try refreshing the page.",
  };
}

/** Monday (Europe/London) of the week containing `now`. */
export function weekStartMonday(now: Date = new Date()): string {
  const parts = calendarDayParts(now);
  const sun0 = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
  const monOffset = (sun0 + 6) % 7; // days since Monday
  const monday = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day - monOffset)
  );
  return monday.toISOString().slice(0, 10);
}

export async function loadMealPlans(
  supabase: SupabaseClient,
  householdId: string,
  weekStart: string
): Promise<FamilyList<MealPlan>> {
  const { data, error } = await supabase
    .from("household_meal_plans")
    .select(MEALS_SELECT)
    .eq("household_id", householdId)
    .eq("week_start", weekStart)
    .order("weekday", { ascending: true });
  if (error) return listFault("loadMealPlans", error.message);
  const items = ((data as MealPlan[] | null) ?? []).map((row) => ({
    ...row,
    weekday: (asWeekday(row.weekday) ?? 0) as Weekday,
  }));
  return listOk(items);
}

export { WEEKDAY_LABEL };
