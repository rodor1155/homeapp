import "server-only";

import { categorise, OVERVIEW_STATUSES } from "@/lib/home-overview";
import type { Locale } from "@/lib/household";
import { createAdminClient } from "@/lib/supabase-admin";

/* Turning a document's dates into reminder rows. Everything that writes here
   goes through the admin client — `reminders` has no insert policy. */

export type ReminderKind = "renewal" | "end";

export type ReminderRule = {
  category: string;
  locale: string;
  offsets: number[];
};

export type ReminderDate = { kind: ReminderKind; dueDate: string };

/** Used when the rules table has no 'default' row (e.g. before the seed runs). */
export const FALLBACK_OFFSETS = [60, 30, 7, 0];

const DAY_MS = 24 * 60 * 60 * 1000;

/** The fields of a document row this module reads. */
export type ReminderDocument = {
  doc_type: string | null;
  provider: string | null;
  end_date: string | null;
  renewal_date: string | null;
};

function parseIsoDate(value: string | null): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return null;
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  );
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function startOfUtcDay(now: Date): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  )
    .toISOString()
    .slice(0, 10);
}

/** Whole days from `from` to `to`, both YYYY-MM-DD. */
export function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS
  );
}

/** `dueDate` minus `offset` days, as YYYY-MM-DD. */
export function offsetDate(dueDate: string, offset: number): string {
  return new Date(Date.parse(`${dueDate}T00:00:00Z`) - offset * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/**
 * Which of a document's dates is worth a reminder: the renewal date if there
 * is one, otherwise the end date. Dates already gone by are ignored, so this
 * returns at most one entry — and an empty array for most documents.
 */
export function pickReminderDates(
  doc: ReminderDocument,
  now: Date = new Date()
): ReminderDate[] {
  const today = startOfUtcDay(now);

  const candidates: ReminderDate[] = [];
  const renewal = parseIsoDate(doc.renewal_date);
  if (renewal) candidates.push({ kind: "renewal", dueDate: renewal });
  const end = parseIsoDate(doc.end_date);
  if (end) candidates.push({ kind: "end", dueDate: end });

  const future = candidates.find((c) => c.dueDate >= today);
  return future ? [future] : [];
}

/** The offsets for a category, falling back to the 'default' row for the locale. */
export function offsetsFor(
  category: string,
  locale: Locale,
  rules: readonly ReminderRule[]
): number[] {
  const match =
    rules.find((r) => r.locale === locale && r.category === category) ??
    rules.find((r) => r.locale === locale && r.category === "default");
  const offsets = match?.offsets?.filter((n) => Number.isInteger(n) && n >= 0);
  return offsets && offsets.length > 0
    ? [...offsets].sort((a, b) => b - a)
    : [...FALLBACK_OFFSETS];
}

export type ReminderSyncResult = {
  documentId: string;
  scheduled: ReminderDate[];
  cancelled: ReminderKind[];
  error: string | null;
};

/**
 * Brings a document's reminders in line with its current dates. Safe to call
 * repeatedly: an unchanged due date is left completely alone, a moved one
 * starts a fresh row (so the old sent-events don't suppress the new nudges),
 * and a date that has gone away cancels whatever was scheduled.
 */
export async function syncRemindersForDocument(
  documentId: string,
  now: Date = new Date()
): Promise<ReminderSyncResult> {
  const empty: ReminderSyncResult = {
    documentId,
    scheduled: [],
    cancelled: [],
    error: null,
  };
  const supabase = createAdminClient();

  const { data: doc, error: loadErr } = await supabase
    .from("documents")
    .select(
      "id, household_id, extraction_status, doc_type, provider, end_date, renewal_date"
    )
    .eq("id", documentId)
    .maybeSingle();

  if (loadErr || !doc) {
    return { ...empty, error: loadErr?.message ?? "document not found" };
  }

  const householdId = doc.household_id as string;
  const usable = (OVERVIEW_STATUSES as readonly string[]).includes(
    doc.extraction_status as string
  );
  const wanted = usable
    ? pickReminderDates(doc as ReminderDocument, now)
    : [];

  const { data: existingRows } = await supabase
    .from("reminders")
    .select("id, kind, due_date, offsets, status")
    .eq("document_id", documentId);
  const existing = existingRows ?? [];

  // Anything scheduled for a kind we no longer want is stood down. Sent rows
  // are history and stay as they are.
  const cancelled: ReminderKind[] = [];
  for (const row of existing) {
    const kind = row.kind as ReminderKind;
    if (wanted.some((w) => w.kind === kind)) continue;
    if (row.status !== "scheduled") continue;
    const { error } = await supabase
      .from("reminders")
      .update({ status: "cancelled" })
      .eq("id", row.id as string);
    if (!error) cancelled.push(kind);
  }

  if (wanted.length === 0) return { ...empty, cancelled };

  const { data: household } = await supabase
    .from("households")
    .select("locale")
    .eq("id", householdId)
    .maybeSingle();
  const locale: Locale =
    (household?.locale as Locale | null | undefined) ?? "UK";

  const { data: ruleRows } = await supabase
    .from("reminder_rules")
    .select("category, locale, offsets")
    .eq("locale", locale);

  const offsets = offsetsFor(
    categorise(doc as ReminderDocument),
    locale,
    (ruleRows as ReminderRule[] | null) ?? []
  );

  // TODO(billing): a free household gets `reminderLimit` active reminders
  // (getEntitlements in lib/billing.ts). Enforce it here, before the insert
  // below, by counting this household's scheduled rows. Not done in this pass —
  // reminder behaviour is unchanged until the limit is designed properly
  // (which document loses its nudge, and how the household is told).
  const scheduled: ReminderDate[] = [];
  for (const target of wanted) {
    const current = existing.find((row) => row.kind === target.kind);

    if (!current) {
      const { error } = await supabase.from("reminders").insert({
        household_id: householdId,
        document_id: documentId,
        kind: target.kind,
        due_date: target.dueDate,
        offsets,
      });
      if (error) return { documentId, scheduled, cancelled, error: error.message };
      scheduled.push(target);
      continue;
    }

    if (current.due_date !== target.dueDate) {
      // A new cycle. Dropping the row takes its events with it, so the fresh
      // schedule fires from scratch.
      await supabase.from("reminders").delete().eq("id", current.id as string);
      const { error } = await supabase.from("reminders").insert({
        household_id: householdId,
        document_id: documentId,
        kind: target.kind,
        due_date: target.dueDate,
        offsets,
      });
      if (error) return { documentId, scheduled, cancelled, error: error.message };
      scheduled.push(target);
      continue;
    }

    // Same date: only pick up a changed rule, and revive a cancelled row.
    const patch: Record<string, unknown> = { offsets };
    if (current.status === "cancelled") patch.status = "scheduled";
    await supabase.from("reminders").update(patch).eq("id", current.id as string);
    if (current.status !== "sent") scheduled.push(target);
  }

  return { documentId, scheduled, cancelled, error: null };
}
