"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";

export type CalendarFeedState = { error?: string; ok?: boolean } | undefined;

type Caller =
  | { ok: false; error: string }
  | { ok: true; householdId: string; userId: string };

async function resolveCaller(supabase: SupabaseClient): Promise<Caller> {
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
  if (!membership) {
    return { ok: false, error: "No household found for your account." };
  }

  return {
    ok: true,
    householdId: membership.household_id as string,
    userId: user.id,
  };
}

function newFeedToken(): string {
  return randomBytes(32).toString("base64url");
}

function refresh() {
  revalidatePath("/settings");
  revalidatePath("/calendar");
}

export async function getOrCreateCalendarFeed(): Promise<
  { token: string } | { error: string }
> {
  const supabase = await createClient();
  const caller = await resolveCaller(supabase);
  if (!caller.ok) return { error: caller.error };

  const { data: existing } = await supabase
    .from("household_calendar_feeds")
    .select("token")
    .eq("household_id", caller.householdId)
    .maybeSingle();

  if (existing?.token) {
    return { token: existing.token as string };
  }

  const token = newFeedToken();
  const { error } = await supabase.from("household_calendar_feeds").insert({
    household_id: caller.householdId,
    token,
    created_by: caller.userId,
  });

  if (error) {
    console.error("[calendar-feed] create", error.message);
    return { error: "We couldn’t create the calendar link just now." };
  }

  refresh();
  return { token };
}

export async function createCalendarFeed(): Promise<CalendarFeedState> {
  const result = await getOrCreateCalendarFeed();
  if ("error" in result) return { error: result.error };
  return { ok: true };
}

export async function regenerateCalendarFeed(): Promise<CalendarFeedState> {
  const supabase = await createClient();
  const caller = await resolveCaller(supabase);
  if (!caller.ok) return { error: caller.error };

  const token = newFeedToken();
  const { data, error } = await supabase
    .from("household_calendar_feeds")
    .update({ token, rotated_at: new Date().toISOString() })
    .eq("household_id", caller.householdId)
    .select("household_id")
    .maybeSingle();

  if (error) {
    console.error("[calendar-feed] regenerate", error.message);
    return { error: "We couldn’t regenerate the link just now." };
  }
  if (!data) {
    return { error: "There isn’t a calendar link to regenerate yet." };
  }

  refresh();
  return { ok: true };
}

export async function revokeCalendarFeed(): Promise<CalendarFeedState> {
  const supabase = await createClient();
  const caller = await resolveCaller(supabase);
  if (!caller.ok) return { error: caller.error };

  const { error } = await supabase
    .from("household_calendar_feeds")
    .delete()
    .eq("household_id", caller.householdId);

  if (error) {
    console.error("[calendar-feed] revoke", error.message);
    return { error: "We couldn’t turn off the calendar link just now." };
  }

  refresh();
  return { ok: true };
}
