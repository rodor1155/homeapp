"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  asRenewalKind,
  defaultRemindDays,
  defaultRepeat,
  RENEWAL_KIND_META,
  rollDueDateForward,
  type RenewalSource,
  type RepeatUnit,
} from "@/lib/renewals";
import { parseDateParts, type PersonKind } from "@/lib/family";
import { createClient } from "@/lib/supabase-server";

export type RenewalState = { error?: string; ok?: boolean; nextDue?: string } | undefined;

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

function refresh() {
  revalidatePath("/family");
  revalidatePath("/dashboard");
  revalidatePath("/documents");
}

async function assertPersonInHousehold(
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
  return data ? null : "That person isn’t in your household.";
}

async function assertDocumentInHousehold(
  supabase: SupabaseClient,
  householdId: string,
  documentId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("documents")
    .select("id")
    .eq("id", documentId)
    .eq("household_id", householdId)
    .maybeSingle();
  return data ? null : "That document isn’t in your household.";
}

function parseRepeatUnit(value: string): RepeatUnit | null {
  if (value === "none" || value === "month" || value === "year") return value;
  return null;
}

function parseDueDate(value: string): string | null {
  if (!value) return null;
  return parseDateParts(value) ? value : null;
}

function parseCost(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value.replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

function parseRemindDays(value: string): number | null {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 365) return null;
  return n;
}

function parseRepeatEvery(value: string): number | null {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 20) return null;
  return n;
}

async function readForm(
  supabase: SupabaseClient,
  householdId: string,
  formData: FormData,
  opts: { requireDue: boolean }
): Promise<{ ok: true; row: Record<string, unknown> } | { ok: false; error: string }> {
  const title = text(formData, "title");
  if (!title) return { ok: false, error: "Give it a title." };

  const kind = asRenewalKind(text(formData, "kind"));
  if (!kind) return { ok: false, error: "Pick a kind." };

  const personRaw = optional(formData, "person_id");
  const personId = personRaw === "house" || !personRaw ? null : personRaw;
  if (personId) {
    const err = await assertPersonInHousehold(supabase, householdId, personId);
    if (err) return { ok: false, error: err };
  }

  const dueRaw = text(formData, "due_date");
  const dueDate = parseDueDate(dueRaw);
  if (opts.requireDue && !dueDate) {
    return { ok: false, error: "Pick a due date." };
  }

  const repeatUnit = parseRepeatUnit(text(formData, "repeat_unit"));
  if (!repeatUnit) return { ok: false, error: "Pick how often it repeats." };

  const repeatEvery = parseRepeatEvery(text(formData, "repeat_every") || "1");
  if (repeatEvery === null) {
    return { ok: false, error: "Repeat interval must be between 1 and 20." };
  }

  const remindDays = parseRemindDays(
    text(formData, "remind_days") || String(defaultRemindDays(kind))
  );
  if (remindDays === null) {
    return { ok: false, error: "Remind me must be between 0 and 365 days." };
  }

  const documentId = optional(formData, "document_id");
  if (documentId) {
    const err = await assertDocumentInHousehold(supabase, householdId, documentId);
    if (err) return { ok: false, error: err };
  }

  const sourceRaw = text(formData, "source") as RenewalSource;
  const source: RenewalSource =
    sourceRaw === "document" || sourceRaw === "suggestion" ? sourceRaw : "manual";

  const cost = parseCost(optional(formData, "cost"));

  return {
    ok: true,
    row: {
      title,
      kind,
      person_id: personId,
      due_date: dueDate,
      repeat_unit: repeatUnit,
      repeat_every: repeatEvery,
      remind_days: remindDays,
      reference: optional(formData, "reference"),
      provider: optional(formData, "provider"),
      cost,
      notes: optional(formData, "notes"),
      document_id: documentId,
      source,
      updated_at: new Date().toISOString(),
    },
  };
}

export async function createRenewalItem(
  _prev: RenewalState,
  formData: FormData
): Promise<RenewalState> {
  const supabase = await createClient();
  const caller = await resolveCaller(supabase);
  if (!caller.ok) return { error: caller.error };

  const parsed = await readForm(supabase, caller.householdId, formData, {
    requireDue: true,
  });
  if (!parsed.ok) return { error: parsed.error };

  const { error } = await supabase.from("renewal_items").insert({
    household_id: caller.householdId,
    status: "active",
    ...parsed.row,
  });
  if (error) return { error: error.message };

  refresh();
  return { ok: true };
}

export async function updateRenewalItem(
  _prev: RenewalState,
  formData: FormData
): Promise<RenewalState> {
  const supabase = await createClient();
  const caller = await resolveCaller(supabase);
  if (!caller.ok) return { error: caller.error };

  const id = text(formData, "id");
  if (!id) return { error: "Missing renewal." };

  const parsed = await readForm(supabase, caller.householdId, formData, {
    requireDue: true,
  });
  if (!parsed.ok) return { error: parsed.error };

  const { error } = await supabase
    .from("renewal_items")
    .update(parsed.row)
    .eq("id", id)
    .eq("household_id", caller.householdId);
  if (error) return { error: error.message };

  refresh();
  return { ok: true };
}

export async function markRenewalDone(id: string): Promise<RenewalState> {
  const supabase = await createClient();
  const caller = await resolveCaller(supabase);
  if (!caller.ok) return { error: caller.error };

  const { data: item } = await supabase
    .from("renewal_items")
    .select("due_date, repeat_unit, repeat_every, status")
    .eq("id", id)
    .eq("household_id", caller.householdId)
    .maybeSingle();

  if (!item?.due_date) return { error: "That renewal wasn’t found." };

  const now = new Date().toISOString();
  const repeatUnit = item.repeat_unit as RepeatUnit;

  if (repeatUnit === "none") {
    const { error } = await supabase
      .from("renewal_items")
      .update({ status: "done", last_done_at: now, updated_at: now })
      .eq("id", id)
      .eq("household_id", caller.householdId);
    if (error) return { error: error.message };
    refresh();
    return { ok: true };
  }

  const nextDue = rollDueDateForward(
    item.due_date as string,
    repeatUnit,
    item.repeat_every as number
  );

  const { error } = await supabase
    .from("renewal_items")
    .update({
      due_date: nextDue,
      status: "active",
      last_done_at: now,
      updated_at: now,
    })
    .eq("id", id)
    .eq("household_id", caller.householdId);
  if (error) return { error: error.message };

  refresh();
  return { ok: true, nextDue };
}

export async function dismissRenewalSuggestion(
  kind: string,
  personId: string | null
): Promise<RenewalState> {
  const supabase = await createClient();
  const caller = await resolveCaller(supabase);
  if (!caller.ok) return { error: caller.error };

  const renewalKind = asRenewalKind(kind);
  if (!renewalKind) return { error: "Unknown kind." };

  if (personId) {
    const err = await assertPersonInHousehold(supabase, caller.householdId, personId);
    if (err) return { error: err };
  }

  const { data: person } = personId
    ? await supabase
        .from("household_people")
        .select("kind, name")
        .eq("id", personId)
        .maybeSingle()
    : { data: null };

  const repeat = defaultRepeat(
    renewalKind,
    (person?.kind as PersonKind | undefined) ?? null
  );
  const kindLabel = RENEWAL_KIND_META[renewalKind].label;
  const title = person ? `${person.name}'s ${kindLabel}` : kindLabel;

  const now = new Date().toISOString();

  let deleteQuery = supabase
    .from("renewal_items")
    .delete()
    .eq("household_id", caller.householdId)
    .eq("kind", renewalKind)
    .eq("status", "dismissed");
  deleteQuery = personId
    ? deleteQuery.eq("person_id", personId)
    : deleteQuery.is("person_id", null);
  await deleteQuery;

  const { error } = await supabase.from("renewal_items").insert({
    household_id: caller.householdId,
    person_id: personId,
    kind: renewalKind,
    title,
    due_date: null,
    repeat_unit: repeat.unit,
    repeat_every: repeat.every,
    remind_days: defaultRemindDays(renewalKind),
    source: "suggestion",
    status: "dismissed",
    updated_at: now,
  });
  if (error) return { error: error.message };

  refresh();
  return { ok: true };
}

export async function undismissRenewalSuggestion(
  kind: string,
  personId: string | null
): Promise<RenewalState> {
  const supabase = await createClient();
  const caller = await resolveCaller(supabase);
  if (!caller.ok) return { error: caller.error };

  const renewalKind = asRenewalKind(kind);
  if (!renewalKind) return { error: "Unknown kind." };

  let query = supabase
    .from("renewal_items")
    .delete()
    .eq("household_id", caller.householdId)
    .eq("kind", renewalKind)
    .eq("status", "dismissed");

  query = personId ? query.eq("person_id", personId) : query.is("person_id", null);

  const { error } = await query;
  if (error) return { error: error.message };

  refresh();
  return { ok: true };
}

export async function deleteRenewalItem(id: string): Promise<RenewalState> {
  const supabase = await createClient();
  const caller = await resolveCaller(supabase);
  if (!caller.ok) return { error: caller.error };

  const { error } = await supabase
    .from("renewal_items")
    .delete()
    .eq("id", id)
    .eq("household_id", caller.householdId);
  if (error) return { error: error.message };

  refresh();
  return { ok: true };
}
