"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";

export type GuestState = { error?: string; ok?: boolean } | undefined;

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

function optional(formData: FormData, key: string): string | null {
  const v = String(formData.get(key) ?? "").trim();
  return v ? v : null;
}

export async function saveGuestPack(
  _prev: GuestState,
  formData: FormData
): Promise<GuestState> {
  const supabase = await createClient();
  const caller = await resolveHousehold(supabase);
  if ("error" in caller) return { error: caller.error };

  const { error } = await supabase
    .from("households")
    .update({
      wifi_name: optional(formData, "wifi_name"),
      wifi_password: optional(formData, "wifi_password"),
      spare_key_note: optional(formData, "spare_key_note"),
      bin_day_note: optional(formData, "bin_day_note"),
      school_run_note: optional(formData, "school_run_note"),
    })
    .eq("id", caller.householdId);
  if (error) return { error: error.message };

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { ok: true };
}
