"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  asRoutineCadence,
  type RoutineCadence,
} from "@/lib/routines";
import { asWeekday } from "@/lib/timetable";
import { createClient } from "@/lib/supabase-server";

export type RoutineState = { error?: string; ok?: boolean } | undefined;

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
function refresh() {
  revalidatePath("/family");
  revalidatePath("/dashboard");
  revalidatePath("/calendar");
}

export async function saveRoutine(
  _prev: RoutineState,
  formData: FormData
): Promise<RoutineState> {
  const id = optional(formData, "routine_id");
  const title = text(formData, "title");
  const cadence = (asRoutineCadence(text(formData, "cadence") || "weekly") ??
    "weekly") as RoutineCadence;
  const weekday = asWeekday(text(formData, "weekday"));
  const dayRaw = text(formData, "day_of_month");
  const day_of_month = dayRaw ? Number(dayRaw) : null;
  const anchor_date = optional(formData, "anchor_date");
  const notes = optional(formData, "notes");
  const active = formData.get("active") != null;

  if (!title) return { error: "Give the routine a name." };
  if (cadence === "monthly") {
    if (!day_of_month || day_of_month < 1 || day_of_month > 28) {
      return { error: "Pick a day of the month (1–28)." };
    }
  } else if (weekday == null) {
    return { error: "Pick which day it falls on." };
  }

  const supabase = await createClient();
  const caller = await resolveHousehold(supabase);
  if ("error" in caller) return { error: caller.error };

  const values = {
    title,
    cadence,
    weekday: cadence === "monthly" ? null : weekday,
    day_of_month: cadence === "monthly" ? day_of_month : null,
    anchor_date: cadence === "fortnightly" ? anchor_date : null,
    notes,
    active,
  };

  if (id) {
    const { error } = await supabase
      .from("household_routines")
      .update(values)
      .eq("id", id)
      .eq("household_id", caller.householdId);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("household_routines").insert({
      household_id: caller.householdId,
      ...values,
    });
    if (error) return { error: error.message };
  }
  refresh();
  return { ok: true };
}

export async function deleteRoutine(
  _prev: RoutineState,
  formData: FormData
): Promise<RoutineState> {
  const id = text(formData, "routine_id");
  if (!id) return { error: "Missing routine." };
  const supabase = await createClient();
  const caller = await resolveHousehold(supabase);
  if ("error" in caller) return { error: caller.error };
  const { error } = await supabase
    .from("household_routines")
    .delete()
    .eq("id", id)
    .eq("household_id", caller.householdId);
  if (error) return { error: error.message };
  refresh();
  return { ok: true };
}
