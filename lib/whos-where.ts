// Today's free-text status per person. Client-safe.

import type { SupabaseClient } from "@supabase/supabase-js";
import { calendarDayParts, type FamilyList } from "@/lib/family";

export type PersonDayStatus = {
  id: string;
  person_id: string;
  status_date: string;
  status_text: string;
};

export const STATUS_SELECT = "id, person_id, status_date, status_text";

export const STATUS_SUGGESTIONS = [
  "At school",
  "At work",
  "WFH",
  "Club",
  "Out",
  "Home",
] as const;

function listOk<T>(items: T[]): FamilyList<T> {
  return { items, fault: null };
}
function listFault<T>(label: string, message: string): FamilyList<T> {
  console.error(`[whos-where] ${label}`, message);
  return {
    items: [],
    fault: "We couldn’t load this just now. Try refreshing the page.",
  };
}

export function todayIso(now: Date = new Date()): string {
  const p = calendarDayParts(now);
  return new Date(Date.UTC(p.year, p.month - 1, p.day)).toISOString().slice(0, 10);
}

export async function loadPersonDayStatuses(
  supabase: SupabaseClient,
  householdId: string,
  statusDate: string
): Promise<FamilyList<PersonDayStatus>> {
  const { data, error } = await supabase
    .from("person_day_status")
    .select(STATUS_SELECT)
    .eq("household_id", householdId)
    .eq("status_date", statusDate);
  if (error) return listFault("loadPersonDayStatuses", error.message);
  return listOk((data as PersonDayStatus[] | null) ?? []);
}
