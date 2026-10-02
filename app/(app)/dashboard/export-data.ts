import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase-server";

/**
 * Household rows the export bundles — people, dates, renewals, lists and the
 * rest. Documents are on-device only and are not included.
 */
export const loadExportHouseholdData = cache(async (householdId: string) => {
  const supabase = await createClient();

  const [
    householdRes,
    propertyRes,
    peopleRes,
    schoolsRes,
    eventsRes,
    renewalsRes,
    routinesRes,
    mealsRes,
    listsRes,
    timetableRes,
  ] = await Promise.all([
    supabase
      .from("households")
      .select("id, name, locale, created_at")
      .eq("id", householdId)
      .maybeSingle(),
    supabase
      .from("properties")
      .select("id, address, type, year_built, created_at")
      .eq("household_id", householdId),
    supabase
      .from("household_people")
      .select(
        "id, name, kind, relation, birthday, school_id, year_group, notes, colour, sort_order, created_at"
      )
      .eq("household_id", householdId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("schools")
      .select("id, name, address, postcode, notes, calendar_url, created_at")
      .eq("household_id", householdId)
      .order("name", { ascending: true }),
    supabase
      .from("household_events")
      .select("id, title, event_date, event_type, person_id, school_id, notes, created_at")
      .eq("household_id", householdId)
      .order("event_date", { ascending: true }),
    supabase
      .from("renewal_items")
      .select(
        "id, person_id, title, kind, due_date, repeat_unit, repeat_every, remind_days, reference, provider, cost, notes, source, status, last_done_at, created_at, updated_at"
      )
      .eq("household_id", householdId)
      .order("due_date", { ascending: true, nullsFirst: false }),
    supabase
      .from("household_routines")
      .select(
        "id, title, cadence, weekday, day_of_month, anchor_date, notes, active, sort_order, created_at"
      )
      .eq("household_id", householdId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("household_meal_plans")
      .select("id, week_start, weekday, title, ingredients_note, sort_order, created_at")
      .eq("household_id", householdId)
      .order("week_start", { ascending: true })
      .order("weekday", { ascending: true }),
    supabase
      .from("shopping_lists")
      .select("id, name, sort_order, created_at")
      .eq("household_id", householdId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("person_timetable_slots")
      .select(
        "id, person_id, weekday, start_time, end_time, period_label, subject, location, bring_kit, kit_label, bring_ingredients, ingredients_note, notes, sort_order, created_at"
      )
      .eq("household_id", householdId)
      .order("weekday", { ascending: true })
      .order("sort_order", { ascending: true }),
  ]);

  const listIds = (listsRes.data ?? []).map((row) => row.id as string);
  const itemsRes =
    listIds.length > 0
      ? await supabase
          .from("shopping_list_items")
          .select("id, list_id, title, checked, sort_order, created_at")
          .in("list_id", listIds)
          .order("sort_order", { ascending: true })
      : { data: [], error: null };

  const error =
    householdRes.error?.message ??
    propertyRes.error?.message ??
    peopleRes.error?.message ??
    schoolsRes.error?.message ??
    eventsRes.error?.message ??
    renewalsRes.error?.message ??
    routinesRes.error?.message ??
    mealsRes.error?.message ??
    listsRes.error?.message ??
    timetableRes.error?.message ??
    itemsRes.error?.message ??
    null;

  return {
    error,
    household: householdRes.data,
    properties: propertyRes.data ?? [],
    people: peopleRes.data ?? [],
    schools: schoolsRes.data ?? [],
    events: eventsRes.data ?? [],
    renewals: renewalsRes.data ?? [],
    routines: routinesRes.data ?? [],
    meals: mealsRes.data ?? [],
    lists: listsRes.data ?? [],
    listItems: itemsRes.data ?? [],
    timetable: timetableRes.data ?? [],
  };
});
