"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { todayIso } from "@/lib/whos-where";
import { createClient } from "@/lib/supabase-server";

export type WhosWhereState = { error?: string; ok?: boolean } | undefined;

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

export async function savePersonDayStatus(
  _prev: WhosWhereState,
  formData: FormData
): Promise<WhosWhereState> {
  const personId = text(formData, "person_id");
  const status_text = text(formData, "status_text");
  const status_date = text(formData, "status_date") || todayIso();

  if (!personId) return { error: "Pick someone." };
  if (!status_text) return { error: "Say where they are." };

  const supabase = await createClient();
  const caller = await resolveHousehold(supabase);
  if ("error" in caller) return { error: caller.error };

  const { data: person } = await supabase
    .from("household_people")
    .select("id")
    .eq("id", personId)
    .eq("household_id", caller.householdId)
    .maybeSingle();
  if (!person) return { error: "That person isn’t in your household." };

  const { error } = await supabase.from("person_day_status").upsert(
    {
      household_id: caller.householdId,
      person_id: personId,
      status_date,
      status_text,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "person_id,status_date" }
  );
  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  revalidatePath("/family");
  return { ok: true };
}

export async function clearPersonDayStatus(
  _prev: WhosWhereState,
  formData: FormData
): Promise<WhosWhereState> {
  const personId = text(formData, "person_id");
  const status_date = text(formData, "status_date") || todayIso();
  if (!personId) return { error: "Pick someone." };

  const supabase = await createClient();
  const caller = await resolveHousehold(supabase);
  if ("error" in caller) return { error: caller.error };

  const { error } = await supabase
    .from("person_day_status")
    .delete()
    .eq("household_id", caller.householdId)
    .eq("person_id", personId)
    .eq("status_date", status_date);
  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  revalidatePath("/family");
  return { ok: true };
}
