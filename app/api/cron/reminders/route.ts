import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { sendReminderEmail } from "@/lib/email";
import { categorise } from "@/lib/home-overview";
import { daysBetween, offsetDate, type ReminderKind } from "@/lib/reminders";
import { createAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";
// A household's worth of email per invocation; Hobby caps at 60s.
export const maxDuration = 60;

// A day's batch should be nowhere near this. The cap is here so a runaway
// table can't hold the function open until it is killed mid-send.
const MAX_REMINDERS = 500;

type ReminderRow = {
  id: string;
  household_id: string;
  document_id: string;
  kind: ReminderKind;
  due_date: string;
  offsets: number[] | null;
  document: {
    doc_type: string | null;
    provider: string | null;
    original_filename: string | null;
  } | null;
};

function authorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;

  const provided =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function label(document: ReminderRow["document"]): string {
  return (
    document?.provider?.trim() ||
    document?.doc_type?.trim() ||
    document?.original_filename?.trim() ||
    "A document"
  );
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    console.warn(
      "[reminders] cron skipped — CRON_SECRET is not set, so this run is ignored"
    );
    return NextResponse.json({
      skipped: true,
      reason: "CRON_SECRET not configured",
      processed: 0,
      sent: 0,
      errors: 0,
    });
  }

  if (!authorized(request)) {
    console.warn("[reminders] cron rejected — bearer token did not match");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);

  const summary = { processed: 0, sent: 0, skipped: 0, errors: 0 };

  const { data, error } = await supabase
    .from("reminders")
    .select(
      "id, household_id, document_id, kind, due_date, offsets, document:documents(doc_type, provider, original_filename)"
    )
    .eq("status", "scheduled")
    .gte("due_date", today)
    .order("due_date", { ascending: true })
    .limit(MAX_REMINDERS);

  if (error) {
    console.error("[reminders] could not load the schedule", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const reminders = (data as unknown as ReminderRow[] | null) ?? [];
  if (reminders.length === 0) return NextResponse.json(summary);

  // Which (reminder, offset) pairs have already gone out. One query, because
  // most of the batch will turn out to have nothing due today.
  const { data: eventRows } = await supabase
    .from("reminder_events")
    .select("reminder_id, offset_days")
    .in(
      "reminder_id",
      reminders.map((r) => r.id)
    );
  const alreadySent = new Set(
    (eventRows ?? []).map((e) => `${e.reminder_id}:${e.offset_days}`)
  );

  // auth.users lookups are per-user, so cache the household once resolved.
  const recipientCache = new Map<string, string[]>();
  async function recipientsFor(householdId: string): Promise<string[]> {
    const cached = recipientCache.get(householdId);
    if (cached) return cached;

    const { data: members } = await supabase
      .from("household_members")
      .select("user_id")
      .eq("household_id", householdId);

    const emails: string[] = [];
    for (const member of members ?? []) {
      const { data: found } = await supabase.auth.admin.getUserById(
        member.user_id as string
      );
      const email = found?.user?.email;
      if (email) emails.push(email);
    }

    recipientCache.set(householdId, emails);
    return emails;
  }

  for (const reminder of reminders) {
    try {
      const offsets = (reminder.offsets ?? []).filter((n) =>
        Number.isInteger(n)
      );
      const due = offsets.filter(
        (offset) =>
          offsetDate(reminder.due_date, offset) === today &&
          !alreadySent.has(`${reminder.id}:${offset}`)
      );
      if (due.length === 0) continue;

      summary.processed += 1;

      const recipients = await recipientsFor(reminder.household_id);
      const providerLabel = label(reminder.document);
      const category = categorise({
        doc_type: reminder.document?.doc_type ?? null,
        provider: reminder.document?.provider ?? null,
      });
      const daysAway = daysBetween(today, reminder.due_date);

      for (const offset of due) {
        let result: string;

        if (recipients.length === 0) {
          result = "no recipients";
          summary.skipped += 1;
        } else {
          const outcomes = await Promise.all(
            recipients.map((to) =>
              sendReminderEmail({
                to,
                providerLabel,
                category,
                kind: reminder.kind,
                dueDate: reminder.due_date,
                daysAway,
              })
            )
          );

          const sent = outcomes.filter((o) => o.ok && !o.skipped).length;
          const skipped = outcomes.filter((o) => o.ok && o.skipped).length;
          const failures = outcomes.filter((o) => !o.ok);

          summary.sent += sent;
          summary.skipped += skipped;
          summary.errors += failures.length;

          result = failures.length
            ? `sent ${sent}/${outcomes.length} — ${failures
                .map((f) => (f.ok ? "" : f.error))
                .join("; ")}`.slice(0, 500)
            : skipped === outcomes.length
              ? "skipped — email not configured"
              : `sent ${sent}/${outcomes.length}`;
        }

        await supabase.from("reminder_events").insert({
          reminder_id: reminder.id,
          offset_days: offset,
          channel: "email",
          result,
        });
      }

      // The day-of nudge is the last one, so the reminder is done with.
      if (due.includes(0)) {
        await supabase
          .from("reminders")
          .update({ status: "sent" })
          .eq("id", reminder.id);
      }
    } catch (e) {
      summary.errors += 1;
      console.error(`[reminders] ${reminder.id} failed`, e);
    }
  }

  return NextResponse.json(summary);
}
