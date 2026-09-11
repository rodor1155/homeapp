"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  asEventType,
  asPersonKind,
  parseDateParts,
} from "@/lib/family";
import {
  normaliseCalendarUrl,
  syncSchoolCalendar,
} from "@/lib/school-calendar";
import { createClient } from "@/lib/supabase-server";

/* People, schools and key dates. Everything here runs on the cookie client,
   so RLS decides what the caller can touch; the household is resolved the
   same way the rest of the app resolves it — the oldest membership. */

export type FamilyState = { error?: string; ok?: boolean } | undefined;

type Caller =
  | { ok: false; error: string }
  | { ok: true; householdId: string };

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

  return { ok: true, householdId: membership.household_id as string };
}

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

/** A trimmed value, or null for the empty string — how every optional column is written. */
function optional(formData: FormData, key: string): string | null {
  const value = text(formData, key);
  return value ? value : null;
}

/** A real calendar date, so 2026-02-31 can't be stored. */
function isRealDate(value: string): boolean {
  const parts = parseDateParts(value);
  if (!parts) return false;
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  return (
    date.getUTCFullYear() === parts.year &&
    date.getUTCMonth() === parts.month - 1 &&
    date.getUTCDate() === parts.day
  );
}

function refresh() {
  revalidatePath("/family");
  revalidatePath("/dashboard");
}

// --- people --------------------------------------------------------------

/** Add someone, or save the edits to someone already here. */
export async function savePerson(
  _prev: FamilyState,
  formData: FormData
): Promise<FamilyState> {
  const personId = text(formData, "person_id");
  const name = text(formData, "name");
  const kind = asPersonKind(text(formData, "kind") || "adult");
  const birthday = optional(formData, "birthday");
  const schoolId = optional(formData, "school_id");
  const yearGroup = optional(formData, "year_group");
  const notes = optional(formData, "notes");

  if (!name) return { error: "Give this person a name." };
  if (!kind) return { error: "Choose whether this is a grown-up or a child." };

  if (birthday) {
    if (!isRealDate(birthday)) {
      return { error: "That birthday isn’t a real date." };
    }
    if ((parseDateParts(birthday)?.year ?? 0) < 1900) {
      return { error: "Check the year on that birthday." };
    }
    if (new Date(`${birthday}T00:00:00Z`).getTime() > Date.now()) {
      return { error: "That birthday is in the future." };
    }
  }

  const supabase = await createClient();
  const caller = await resolveCaller(supabase);
  if (!caller.ok) return { error: caller.error };

  const values = {
    name,
    kind,
    birthday,
    school_id: schoolId,
    year_group: yearGroup,
    notes,
  };

  if (personId) {
    const { error } = await supabase
      .from("household_people")
      .update(values)
      .eq("id", personId)
      .eq("household_id", caller.householdId);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from("household_people")
      .insert({ household_id: caller.householdId, ...values });
    if (error) return { error: error.message };
  }

  refresh();
  return { ok: true };
}

export async function deletePerson(
  _prev: FamilyState,
  formData: FormData
): Promise<FamilyState> {
  const personId = text(formData, "person_id");
  if (!personId) return { error: "Missing person." };

  const supabase = await createClient();
  const caller = await resolveCaller(supabase);
  if (!caller.ok) return { error: caller.error };

  const { error } = await supabase
    .from("household_people")
    .delete()
    .eq("id", personId)
    .eq("household_id", caller.householdId);
  if (error) return { error: error.message };

  refresh();
  return { ok: true };
}

// --- schools -------------------------------------------------------------

export async function saveSchool(
  _prev: FamilyState,
  formData: FormData
): Promise<FamilyState> {
  const schoolId = text(formData, "school_id");
  const name = text(formData, "name");
  const address = optional(formData, "address");
  const notes = optional(formData, "notes");
  const calendarTitle = optional(formData, "calendar_title");
  const calendarRaw = text(formData, "calendar_url");

  if (!name) return { error: "Give the school a name." };

  let calendarUrl: string | null = null;
  if (calendarRaw) {
    const normalised = normaliseCalendarUrl(calendarRaw);
    if ("error" in normalised) return { error: normalised.error };
    calendarUrl = normalised.url;
  }

  const supabase = await createClient();
  const caller = await resolveCaller(supabase);
  if (!caller.ok) return { error: caller.error };

  const values = {
    name,
    address,
    notes,
    calendar_url: calendarUrl,
    calendar_title: calendarTitle,
  };

  let savedId = schoolId;
  let previousUrl: string | null = null;

  if (schoolId) {
    const { data: existing } = await supabase
      .from("schools")
      .select("calendar_url")
      .eq("id", schoolId)
      .eq("household_id", caller.householdId)
      .maybeSingle();
    previousUrl = (existing?.calendar_url as string | null) ?? null;

    const { error } = await supabase
      .from("schools")
      .update(values)
      .eq("id", schoolId)
      .eq("household_id", caller.householdId);
    if (error) return { error: error.message };
  } else {
    const { data, error } = await supabase
      .from("schools")
      .insert({ household_id: caller.householdId, ...values })
      .select("id")
      .single();
    if (error) return { error: error.message };
    savedId = data.id as string;
  }

  // A changed link is fetched straight away so the household sees dates (or
  // the reason there are none) without pressing Refresh. Clearing it runs too:
  // that is what drops the cached rows. Never allowed to fail the save.
  if (savedId && calendarUrl !== previousUrl) {
    try {
      await syncSchoolCalendar(savedId);
    } catch (error) {
      console.error("[family] calendar sync failed", savedId, error);
    }
  }

  refresh();
  return { ok: true };
}

/**
 * Re-read a school's feed now. The school is looked up on the cookie client
 * first, so RLS is what decides whether this household may sync it — the sync
 * itself runs on the service role.
 */
export async function refreshSchoolCalendar(
  _prev: FamilyState,
  formData: FormData
): Promise<FamilyState> {
  const schoolId = text(formData, "school_id");
  if (!schoolId) return { error: "Missing school." };

  const supabase = await createClient();
  const caller = await resolveCaller(supabase);
  if (!caller.ok) return { error: caller.error };

  const { data: school } = await supabase
    .from("schools")
    .select("id, calendar_url")
    .eq("id", schoolId)
    .eq("household_id", caller.householdId)
    .maybeSingle();
  if (!school) return { error: "We couldn’t find that school." };
  if (!(school.calendar_url as string | null)?.trim()) {
    return { error: "Add a calendar link first." };
  }

  let result;
  try {
    result = await syncSchoolCalendar(schoolId);
  } catch (error) {
    console.error("[family] calendar refresh failed", schoolId, error);
    return { error: "We couldn’t read that calendar just now." };
  }

  refresh();
  return result.error ? { error: result.error } : { ok: true };
}

/**
 * Remove a school. Anyone who was at it keeps their row — the foreign key
 * sets their `school_id` back to null.
 */
export async function deleteSchool(
  _prev: FamilyState,
  formData: FormData
): Promise<FamilyState> {
  const schoolId = text(formData, "school_id");
  if (!schoolId) return { error: "Missing school." };

  const supabase = await createClient();
  const caller = await resolveCaller(supabase);
  if (!caller.ok) return { error: caller.error };

  const { error } = await supabase
    .from("schools")
    .delete()
    .eq("id", schoolId)
    .eq("household_id", caller.householdId);
  if (error) return { error: error.message };

  refresh();
  return { ok: true };
}

// --- key dates -----------------------------------------------------------

export async function saveEvent(
  _prev: FamilyState,
  formData: FormData
): Promise<FamilyState> {
  const eventId = text(formData, "event_id");
  const title = text(formData, "title");
  const eventDate = text(formData, "event_date");
  const eventType = asEventType(text(formData, "event_type") || "home");
  const personId = optional(formData, "person_id");
  const schoolId = optional(formData, "school_id");
  const notes = optional(formData, "notes");

  if (!title) return { error: "Say what the date is for." };
  if (!eventDate) return { error: "Pick a date." };
  if (!isRealDate(eventDate)) return { error: "That isn’t a real date." };
  if (!eventType) return { error: "Choose what kind of date this is." };

  const supabase = await createClient();
  const caller = await resolveCaller(supabase);
  if (!caller.ok) return { error: caller.error };

  const values = {
    title,
    event_date: eventDate,
    event_type: eventType,
    person_id: personId,
    school_id: schoolId,
    notes,
  };

  if (eventId) {
    const { error } = await supabase
      .from("household_events")
      .update(values)
      .eq("id", eventId)
      .eq("household_id", caller.householdId);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from("household_events")
      .insert({ household_id: caller.householdId, ...values });
    if (error) return { error: error.message };
  }

  refresh();
  return { ok: true };
}

export async function deleteEvent(
  _prev: FamilyState,
  formData: FormData
): Promise<FamilyState> {
  const eventId = text(formData, "event_id");
  if (!eventId) return { error: "Missing date." };

  const supabase = await createClient();
  const caller = await resolveCaller(supabase);
  if (!caller.ok) return { error: caller.error };

  const { error } = await supabase
    .from("household_events")
    .delete()
    .eq("id", eventId)
    .eq("household_id", caller.householdId);
  if (error) return { error: error.message };

  refresh();
  return { ok: true };
}
