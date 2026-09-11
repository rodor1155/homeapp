"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { weekStartMonday } from "@/lib/meals";
import { asWeekday } from "@/lib/timetable";
import { createClient } from "@/lib/supabase-server";

export type MealState = { error?: string; ok?: boolean } | undefined;

async function resolveHousehold(supabase: SupabaseClient) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");
  const { data: membership } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!membership) return { error: "No household found for your account." as const };
  return { householdId: membership.household_id as string };
}

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}
function optional(formData: FormData, key: string): string | null {
  const v = text(formData, key);
  return v ? v : null;
}

export async function saveMeal(
  _prev: MealState,
  formData: FormData
): Promise<MealState> {
  const mealId = optional(formData, "meal_id");
  const weekStart = text(formData, "week_start") || weekStartMonday();
  const weekday = asWeekday(text(formData, "weekday"));
  const title = text(formData, "title");
  const ingredients_note = optional(formData, "ingredients_note");

  if (weekday == null) return { error: "Pick a day." };
  if (!title) return { error: "What’s for dinner?" };

  const supabase = await createClient();
  const caller = await resolveHousehold(supabase);
  if ("error" in caller) return { error: caller.error };

  const values = {
    week_start: weekStart,
    weekday,
    title,
    ingredients_note,
  };

  if (mealId) {
    const { error } = await supabase
      .from("household_meal_plans")
      .update(values)
      .eq("id", mealId)
      .eq("household_id", caller.householdId);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("household_meal_plans").upsert(
      { household_id: caller.householdId, ...values },
      { onConflict: "household_id,week_start,weekday" }
    );
    if (error) return { error: error.message };
  }

  revalidatePath("/family");
  revalidatePath("/dashboard");
  revalidatePath("/lists");
  return { ok: true };
}

export async function deleteMeal(
  _prev: MealState,
  formData: FormData
): Promise<MealState> {
  const mealId = text(formData, "meal_id");
  if (!mealId) return { error: "Missing meal." };
  const supabase = await createClient();
  const caller = await resolveHousehold(supabase);
  if ("error" in caller) return { error: caller.error };
  const { error } = await supabase
    .from("household_meal_plans")
    .delete()
    .eq("id", mealId)
    .eq("household_id", caller.householdId);
  if (error) return { error: error.message };
  revalidatePath("/family");
  revalidatePath("/dashboard");
  return { ok: true };
}

/** Split ingredients_note onto the household's default (or first) shopping list. */
export async function addMealIngredientsToList(
  _prev: MealState,
  formData: FormData
): Promise<MealState> {
  const mealId = text(formData, "meal_id");
  if (!mealId) return { error: "Missing meal." };

  const supabase = await createClient();
  const caller = await resolveHousehold(supabase);
  if ("error" in caller) return { error: caller.error };

  const { data: meal, error: mealErr } = await supabase
    .from("household_meal_plans")
    .select("id, title, ingredients_note")
    .eq("id", mealId)
    .eq("household_id", caller.householdId)
    .maybeSingle();
  if (mealErr) return { error: mealErr.message };
  if (!meal) return { error: "That meal isn’t here." };

  const note = String(meal.ingredients_note ?? "").trim();
  if (!note) return { error: "Add some ingredients on the meal first." };

  const lines = note
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (lines.length === 0) return { error: "Add some ingredients on the meal first." };

  const { data: lists, error: listErr } = await supabase
    .from("shopping_lists")
    .select("id")
    .eq("household_id", caller.householdId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(1);
  if (listErr) return { error: listErr.message };

  let listId = lists?.[0]?.id as string | undefined;
  if (!listId) {
    const { data: created, error: createErr } = await supabase
      .from("shopping_lists")
      .insert({
        household_id: caller.householdId,
        name: "Shopping",
      })
      .select("id")
      .single();
    if (createErr) return { error: createErr.message };
    listId = created.id as string;
  }

  const rows = lines.map((title, i) => ({
    list_id: listId,
    household_id: caller.householdId,
    title,
    sort_order: i,
  }));
  const { error: itemErr } = await supabase
    .from("shopping_list_items")
    .insert(rows);
  if (itemErr) return { error: itemErr.message };

  revalidatePath("/lists");
  revalidatePath(`/lists/${listId}`);
  revalidatePath("/dashboard");
  return { ok: true };
}
