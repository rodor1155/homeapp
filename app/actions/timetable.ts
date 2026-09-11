"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { extractTimetable } from "@/lib/timetable-extract";
import {
  asTimeHm,
  asWeekday,
  inferKitFlags,
  type TimetableSlotDraft,
  type Weekday,
} from "@/lib/timetable";
import { createClient } from "@/lib/supabase-server";

export type TimetableState =
  | {
      error?: string;
      ok?: boolean;
      /** Present after a successful extract — parent reviews before replace. */
      draftSlots?: TimetableSlotDraft[];
      extractNotes?: string | null;
    }
  | undefined;

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

function optional(formData: FormData, key: string): string | null {
  const value = text(formData, key);
  return value ? value : null;
}

function boolField(formData: FormData, key: string): boolean {
  const raw = formData.get(key);
  if (raw == null) return false;
  const v = String(raw).toLowerCase();
  return v === "on" || v === "true" || v === "1" || v === "yes";
}

function refresh() {
  revalidatePath("/family");
  revalidatePath("/dashboard");
  revalidatePath("/calendar");
}

async function assertChildInHousehold(
  supabase: SupabaseClient,
  householdId: string,
  personId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("household_people")
    .select("id, kind")
    .eq("id", personId)
    .eq("household_id", householdId)
    .maybeSingle();
  if (!data) return "That person isn’t in your household.";
  // Allow any person — clubs for adults exist — but UI targets children.
  return null;
}

function draftFromForm(formData: FormData): TimetableSlotDraft | { error: string } {
  const weekday = asWeekday(text(formData, "weekday"));
  const subject = text(formData, "subject");
  if (weekday == null) return { error: "Pick a day of the week." };
  if (!subject) return { error: "Say what the lesson is." };

  let bring_kit = boolField(formData, "bring_kit");
  let kit_label = optional(formData, "kit_label");
  let bring_ingredients = boolField(formData, "bring_ingredients");
  let ingredients_note = optional(formData, "ingredients_note");

  if (!bring_kit && !bring_ingredients && boolField(formData, "auto_flags")) {
    const inferred = inferKitFlags(subject);
    bring_kit = inferred.bring_kit;
    kit_label = kit_label ?? inferred.kit_label;
    bring_ingredients = inferred.bring_ingredients;
    ingredients_note = ingredients_note ?? inferred.ingredients_note;
  }

  const start = asTimeHm(optional(formData, "start_time"));
  const end = asTimeHm(optional(formData, "end_time"));
  if (optional(formData, "start_time") && !start) {
    return { error: "Start time should look like 09:15." };
  }
  if (optional(formData, "end_time") && !end) {
    return { error: "End time should look like 10:15." };
  }

  return {
    weekday,
    start_time: start,
    end_time: end,
    period_label: optional(formData, "period_label"),
    subject,
    location: optional(formData, "location"),
    bring_kit,
    kit_label: bring_kit ? kit_label ?? "PE kit" : null,
    bring_ingredients,
    ingredients_note: bring_ingredients
      ? ingredients_note ?? `Ingredients for ${subject}`
      : null,
    notes: optional(formData, "notes"),
    sort_order: Number(text(formData, "sort_order") || "0") || 0,
  };
}

/** Add or update a single slot. */
export async function saveTimetableSlot(
  _prev: TimetableState,
  formData: FormData
): Promise<TimetableState> {
  const slotId = optional(formData, "slot_id");
  const personId = text(formData, "person_id");
  if (!personId) return { error: "Pick whose timetable this is." };

  const draft = draftFromForm(formData);
  if ("error" in draft) return { error: draft.error };

  const supabase = await createClient();
  const caller = await resolveCaller(supabase);
  if (!caller.ok) return { error: caller.error };

  const personErr = await assertChildInHousehold(
    supabase,
    caller.householdId,
    personId
  );
  if (personErr) return { error: personErr };

  const values = {
    person_id: personId,
    weekday: draft.weekday,
    start_time: draft.start_time,
    end_time: draft.end_time,
    period_label: draft.period_label,
    subject: draft.subject,
    location: draft.location,
    bring_kit: draft.bring_kit,
    kit_label: draft.kit_label,
    bring_ingredients: draft.bring_ingredients,
    ingredients_note: draft.ingredients_note,
    notes: draft.notes,
    sort_order: draft.sort_order,
    updated_at: new Date().toISOString(),
  };

  if (slotId) {
    const { error } = await supabase
      .from("person_timetable_slots")
      .update(values)
      .eq("id", slotId)
      .eq("household_id", caller.householdId);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("person_timetable_slots").insert({
      household_id: caller.householdId,
      ...values,
    });
    if (error) return { error: error.message };
  }

  refresh();
  return { ok: true };
}

export async function deleteTimetableSlot(
  _prev: TimetableState,
  formData: FormData
): Promise<TimetableState> {
  const slotId = text(formData, "slot_id");
  if (!slotId) return { error: "Missing lesson." };

  const supabase = await createClient();
  const caller = await resolveCaller(supabase);
  if (!caller.ok) return { error: caller.error };

  const { error } = await supabase
    .from("person_timetable_slots")
    .delete()
    .eq("id", slotId)
    .eq("household_id", caller.householdId);
  if (error) return { error: error.message };

  refresh();
  return { ok: true };
}

/**
 * Replace one child's entire week with the reviewed draft slots (JSON in
 * `slots_json`). Used after extract confirm or a bulk paste save.
 */
export async function replacePersonTimetable(
  _prev: TimetableState,
  formData: FormData
): Promise<TimetableState> {
  const personId = text(formData, "person_id");
  if (!personId) return { error: "Pick whose timetable this is." };

  let drafts: TimetableSlotDraft[] = [];
  try {
    const parsed = JSON.parse(text(formData, "slots_json") || "[]") as unknown;
    if (!Array.isArray(parsed)) throw new Error("not array");
    drafts = parsed
      .map((row, index) => {
        if (!row || typeof row !== "object") return null;
        const r = row as Record<string, unknown>;
        const weekday = asWeekday(r.weekday);
        const subject = String(r.subject ?? "").trim();
        if (weekday == null || !subject) return null;
        const inferred = inferKitFlags(subject);
        const bring_kit = Boolean(r.bring_kit) || inferred.bring_kit;
        const bring_ingredients =
          Boolean(r.bring_ingredients) || inferred.bring_ingredients;
        return {
          weekday: weekday as Weekday,
          start_time: asTimeHm(r.start_time),
          end_time: asTimeHm(r.end_time),
          period_label: r.period_label ? String(r.period_label) : null,
          subject,
          location: r.location ? String(r.location) : null,
          bring_kit,
          kit_label: bring_kit
            ? String(r.kit_label ?? inferred.kit_label ?? "PE kit")
            : null,
          bring_ingredients,
          ingredients_note: bring_ingredients
            ? String(
                r.ingredients_note ??
                  inferred.ingredients_note ??
                  `Ingredients for ${subject}`
              )
            : null,
          notes: r.notes ? String(r.notes) : null,
          sort_order: typeof r.sort_order === "number" ? r.sort_order : index,
        } satisfies TimetableSlotDraft;
      })
      .filter((s): s is TimetableSlotDraft => s != null);
  } catch {
    return { error: "That week didn’t look right — try again." };
  }

  const supabase = await createClient();
  const caller = await resolveCaller(supabase);
  if (!caller.ok) return { error: caller.error };

  const personErr = await assertChildInHousehold(
    supabase,
    caller.householdId,
    personId
  );
  if (personErr) return { error: personErr };

  const { error: delError } = await supabase
    .from("person_timetable_slots")
    .delete()
    .eq("household_id", caller.householdId)
    .eq("person_id", personId);
  if (delError) return { error: delError.message };

  if (drafts.length > 0) {
    const rows = drafts.map((d, i) => ({
      household_id: caller.householdId,
      person_id: personId,
      weekday: d.weekday,
      start_time: d.start_time,
      end_time: d.end_time,
      period_label: d.period_label,
      subject: d.subject,
      location: d.location,
      bring_kit: d.bring_kit,
      kit_label: d.kit_label,
      bring_ingredients: d.bring_ingredients,
      ingredients_note: d.ingredients_note,
      notes: d.notes,
      sort_order: d.sort_order ?? i,
    }));
    const { error: insError } = await supabase
      .from("person_timetable_slots")
      .insert(rows);
    if (insError) return { error: insError.message };
  }

  refresh();
  return { ok: true };
}

/** Scan a photo and/or pasted text; return draft slots for review (no write). */
export async function extractTimetableAction(
  _prev: TimetableState,
  formData: FormData
): Promise<TimetableState> {
  const personId = text(formData, "person_id");
  if (!personId) return { error: "Pick whose timetable this is." };

  const pastedText = optional(formData, "pasted_text");
  const file = formData.get("photo");

  let imageBytes: Uint8Array | null = null;
  let mimeType: string | null = null;
  let filename: string | null = null;

  if (file && typeof file === "object" && "arrayBuffer" in file) {
    const blob = file as File;
    if (blob.size > 0) {
      imageBytes = new Uint8Array(await blob.arrayBuffer());
      mimeType = blob.type || null;
      filename = blob.name || "timetable.jpg";
    }
  }

  const supabase = await createClient();
  const caller = await resolveCaller(supabase);
  if (!caller.ok) return { error: caller.error };

  const personErr = await assertChildInHousehold(
    supabase,
    caller.householdId,
    personId
  );
  if (personErr) return { error: personErr };

  const result = await extractTimetable({
    imageBytes,
    mimeType,
    filename,
    pastedText,
  });
  if (!result.ok) return { error: result.error };

  return {
    ok: true,
    draftSlots: result.slots,
    extractNotes: result.notes,
  };
}
