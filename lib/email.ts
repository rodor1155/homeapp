import "server-only";

import { Resend } from "resend";
import type { ReminderKind } from "@/lib/reminders";

/* Thin wrapper round Resend. Email is never the point of the request that
   triggers it, so a missing key is a skip and a bad send is a returned error —
   nothing in here throws. */

export type EmailResult =
  | { ok: true; skipped: true; reason: string }
  | { ok: true; skipped: false; id: string | null }
  | { ok: false; skipped: false; error: string };

export type ReminderEmail = {
  to: string;
  providerLabel: string;
  category: string;
  kind: ReminderKind;
  dueDate: string;
  daysAway: number;
};

function formatDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function when(daysAway: number): string {
  if (daysAway <= 0) return "today";
  if (daysAway === 1) return "tomorrow";
  return `in ${daysAway} days`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Sends one reminder. `{ skipped: true }` when email isn't configured. */
export async function sendReminderEmail(
  input: ReminderEmail
): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.REMINDERS_FROM_EMAIL;

  if (!apiKey || !from) {
    const missing = [
      apiKey ? null : "RESEND_API_KEY",
      from ? null : "REMINDERS_FROM_EMAIL",
    ]
      .filter(Boolean)
      .join(" and ");
    console.warn(`[reminders] email not sent — ${missing} is not set`);
    return { ok: true, skipped: true, reason: `missing ${missing}` };
  }

  const verb = input.kind === "renewal" ? "renews" : "ends";
  const date = formatDate(input.dueDate);
  const timing = when(input.daysAway);

  const subject =
    input.daysAway <= 0
      ? `${input.providerLabel} ${verb} today`
      : `${input.providerLabel} ${verb} ${timing}`;

  const lines = [
    `${input.providerLabel} ${verb} on ${date} — ${timing}.`,
    "",
    `It is filed under ${input.category} in homeapp. If you have already dealt with it there is nothing to do; otherwise this is your nudge to have a look before the date passes.`,
    "",
    "— homeapp",
  ];

  const html = lines
    .map((line) => (line ? `<p>${escapeHtml(line)}</p>` : ""))
    .join("\n");

  try {
    const { data, error } = await new Resend(apiKey).emails.send({
      from,
      to: input.to,
      subject,
      text: lines.join("\n"),
      html,
    });
    if (error) {
      return { ok: false, skipped: false, error: error.message };
    }
    return { ok: true, skipped: false, id: data?.id ?? null };
  } catch (e) {
    return {
      ok: false,
      skipped: false,
      error: e instanceof Error ? e.message : "send failed",
    };
  }
}
