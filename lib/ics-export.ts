// Pure ICS builder for the household subscribe feed. No server-only imports —
// safe to exercise from a standalone Node script via relative imports.

import { decodeHtmlEntities } from "./html-entities";

/** 256-bit token → base64url without padding. */
export const ICS_FEED_TOKEN_LENGTH = 43;

export function isValidFeedToken(token: string): boolean {
  return (
    token.length === ICS_FEED_TOKEN_LENGTH && /^[A-Za-z0-9_-]+$/.test(token)
  );
}

const CRLF = "\r\n";
const DAY_MS = 24 * 60 * 60 * 1000;
/** Stable DTSTAMP when a row has no timestamp (RFC 5545 UTC basic format). */
export const ICS_FALLBACK_DTSTAMP = "20240101T000000Z";
const FEED_WINDOW_PAST_DAYS = 90;
const FEED_WINDOW_FUTURE_DAYS = 730;
const LONDON_TZ = "Europe/London";

const LONDON_DAY_FORMAT = new Intl.DateTimeFormat("en-GB", {
  timeZone: LONDON_TZ,
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

export type DateParts = { year: number; month: number; day: number };

export type IcsHouseholdEvent = {
  id: string;
  title: string;
  event_date: string;
  event_type: string;
  notes: string | null;
  created_at?: string | null;
};

export type IcsRenewalItem = {
  id: string;
  person_id: string | null;
  title: string;
  kind: string;
  due_date: string;
  remind_days: number;
  reference: string | null;
  provider: string | null;
  notes: string | null;
  document_id: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

export type IcsDocument = {
  id: string;
  original_filename: string;
  doc_type: string | null;
  provider: string | null;
  renewal_date: string | null;
  end_date: string | null;
  superseded_by: string | null;
  created_at?: string | null;
};

export type IcsPerson = {
  id: string;
  name: string;
  birthday: string | null;
  created_at?: string | null;
};

export type IcsFeedInput = {
  householdName: string;
  appOrigin: string;
  generatedAt: Date;
  events: readonly IcsHouseholdEvent[];
  renewals: readonly IcsRenewalItem[];
  documents: readonly IcsDocument[];
  people: readonly IcsPerson[];
  /** event_type → CATEGORIES label */
  eventTypeLabels: Readonly<Record<string, string>>;
  /** renewal kind → human label */
  renewalKindLabels: Readonly<Record<string, string>>;
};

export type IcsFeedWindow = {
  from: string;
  to: string;
};

/** London calendar day as YYYY-MM-DD parts. */
export function calendarDayParts(now: Date = new Date()): DateParts {
  const bits = LONDON_DAY_FORMAT.formatToParts(now);
  const num = (type: Intl.DateTimeFormatPartTypes) =>
    Number(bits.find((part) => part.type === type)?.value);
  return { year: num("year"), month: num("month"), day: num("day") };
}

export function parseDateParts(value: string | null | undefined): DateParts | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const parts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
  return parts.month >= 1 && parts.month <= 12 && parts.day >= 1 && parts.day <= 31
    ? parts
    : null;
}

export function formatIsoDate(parts: DateParts): string {
  const month = String(parts.month).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");
  return `${parts.year}-${month}-${day}`;
}

/** Whole-day offset on a stored YYYY-MM-DD (UTC date math, not local midnight). */
export function addCalendarDays(iso: string, days: number): string | null {
  const parts = parseDateParts(iso);
  if (!parts) return null;
  const at = Date.UTC(parts.year, parts.month - 1, parts.day) + days * DAY_MS;
  const d = new Date(at);
  return formatIsoDate({
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  });
}

export function feedWindow(now: Date = new Date()): IcsFeedWindow {
  const today = formatIsoDate(calendarDayParts(now));
  return {
    from: addCalendarDays(today, -FEED_WINDOW_PAST_DAYS) ?? today,
    to: addCalendarDays(today, FEED_WINDOW_FUTURE_DAYS) ?? today,
  };
}

export function dateInWindow(
  iso: string,
  window: IcsFeedWindow
): boolean {
  return iso >= window.from && iso <= window.to;
}

export function formatIcsDate(iso: string): string | null {
  const parts = parseDateParts(iso);
  if (!parts) return null;
  const month = String(parts.month).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");
  return `${parts.year}${month}${day}`;
}

export function formatIcsDateTimeUtc(at: Date): string {
  const y = at.getUTCFullYear();
  const mo = String(at.getUTCMonth() + 1).padStart(2, "0");
  const d = String(at.getUTCDate()).padStart(2, "0");
  const h = String(at.getUTCHours()).padStart(2, "0");
  const mi = String(at.getUTCMinutes()).padStart(2, "0");
  const s = String(at.getUTCSeconds()).padStart(2, "0");
  return `${y}${mo}${d}T${h}${mi}${s}Z`;
}

const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

export function sanitizeIcsText(value: string | null | undefined): string {
  if (!value) return "";
  return decodeHtmlEntities(value).replace(CONTROL_CHARS, "").trim();
}

/** RFC 5545 TEXT escaping. */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\n|\r/g, "\\n");
}

/** Fold one logical line at 75 UTF-8 octets; continuations start with a space. */
export function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(line);
  if (bytes.length <= 75) return line;

  const chunks: string[] = [];
  let offset = 0;
  let continuation = false;

  while (offset < bytes.length) {
    const budget = continuation ? 74 : 75;
    let end = Math.min(offset + budget, bytes.length);
    if (end < bytes.length) {
      while (end > offset && (bytes[end] & 0xc0) === 0x80) end--;
      if (end <= offset) end = Math.min(offset + budget, bytes.length);
    }
    const piece = new TextDecoder().decode(bytes.slice(offset, end));
    chunks.push(continuation ? ` ${piece}` : piece);
    offset = end;
    continuation = true;
  }

  return chunks.join(CRLF);
}

function property(name: string, value: string): string {
  return foldIcsLine(`${name}:${value}`);
}

function textProperty(name: string, value: string): string {
  return property(name, escapeIcsText(value));
}

/** Row updated_at / created_at → DTSTAMP / LAST-MODIFIED, else a fixed epoch. */
export function sourceDtStamp(source: string | null | undefined): string {
  const parsed = source ? Date.parse(source) : NaN;
  if (Number.isFinite(parsed)) return formatIcsDateTimeUtc(new Date(parsed));
  return ICS_FALLBACK_DTSTAMP;
}

function maxDtStamp(stamps: readonly string[]): string {
  if (stamps.length === 0) return ICS_FALLBACK_DTSTAMP;
  return stamps.reduce((max, stamp) => (stamp > max ? stamp : max));
}

function documentTitle(doc: IcsDocument): string {
  return sanitizeIcsText(doc.doc_type || doc.provider || doc.original_filename);
}

function renewalSummary(
  item: IcsRenewalItem,
  personName: string | null,
  kindLabels: Readonly<Record<string, string>>
): string {
  const kindLabel = kindLabels[item.kind] ?? item.kind;
  if (personName) return `${kindLabel} renewal — ${personName}`;
  return sanitizeIcsText(item.title) || `${kindLabel} renewal`;
}

function renewalDescription(item: IcsRenewalItem): string | null {
  const lines = [item.provider, item.reference, item.notes]
    .map((line) => sanitizeIcsText(line))
    .filter(Boolean);
  return lines.length > 0 ? lines.join("\n") : null;
}

type VEventBlock = {
  uid: string;
  summary: string;
  startDate: string;
  /** updated_at, else created_at — drives DTSTAMP and LAST-MODIFIED. */
  stampSource?: string | null;
  description?: string | null;
  categories?: string | null;
  url?: string | null;
  rrule?: string | null;
  alarmDays?: number;
};

function buildVEvent(block: VEventBlock): { lines: string[]; dtStamp: string } {
  const dtStart = formatIcsDate(block.startDate);
  const dtEnd = addCalendarDays(block.startDate, 1);
  if (!dtStart || !dtEnd) return { lines: [], dtStamp: ICS_FALLBACK_DTSTAMP };
  const end = formatIcsDate(dtEnd);
  if (!end) return { lines: [], dtStamp: ICS_FALLBACK_DTSTAMP };

  const dtStamp = sourceDtStamp(block.stampSource);

  const lines = [
    "BEGIN:VEVENT",
    property("UID", block.uid),
    property("DTSTAMP", dtStamp),
    property("LAST-MODIFIED", dtStamp),
    property("SEQUENCE", "0"),
    property("DTSTART;VALUE=DATE", dtStart),
    property("DTEND;VALUE=DATE", end),
    textProperty("SUMMARY", block.summary),
    property("TRANSP", "TRANSPARENT"),
  ];

  if (block.description) lines.push(textProperty("DESCRIPTION", block.description));
  if (block.categories) lines.push(textProperty("CATEGORIES", block.categories));
  if (block.url) lines.push(property("URL", block.url));
  if (block.rrule) lines.push(property("RRULE", block.rrule));

  if (block.alarmDays && block.alarmDays > 0) {
    lines.push(
      "BEGIN:VALARM",
      property("ACTION", "DISPLAY"),
      property("TRIGGER", `-P${block.alarmDays}D`),
      textProperty("DESCRIPTION", block.summary),
      "END:VALARM"
    );
  }

  lines.push("END:VEVENT");
  return { lines, dtStamp };
}

function birthdayRrule(parts: DateParts): string {
  if (parts.month === 2 && parts.day === 29) {
    // Leap-day birthdays: yearly on 29 Feb where it exists; clients vary on other years.
    return "FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29";
  }
  return `FREQ=YEARLY;BYMONTH=${parts.month};BYMONTHDAY=${parts.day}`;
}

function birthdayStartDate(birthday: string): string | null {
  const parts = parseDateParts(birthday);
  if (!parts) return null;
  const year = parts.year > 0 ? parts.year : 1900;
  return formatIsoDate({ year, month: parts.month, day: parts.day });
}

/** Build the full VCALENDAR body (CRLF line endings, folded lines). */
export function buildHouseholdIcs(
  input: IcsFeedInput,
  now: Date = input.generatedAt
): string {
  const window = feedWindow(now);
  const peopleById = new Map(input.people.map((person) => [person.id, person.name]));
  const linkedDocIds = new Set(
    input.renewals
      .filter((item) => item.document_id)
      .map((item) => item.document_id as string)
  );

  const events: string[] = [
    "BEGIN:VCALENDAR",
    property("VERSION", "2.0"),
    property("PRODID", "-//Hearth Home//Household feed//EN"),
    property("CALSCALE", "GREGORIAN"),
    property("METHOD", "PUBLISH"),
    textProperty("X-WR-CALNAME", `${input.householdName} · Hearth`),
    property("X-WR-TIMEZONE", LONDON_TZ),
    property("X-PUBLISHED-TTL", "PT6H"),
    property("REFRESH-INTERVAL;VALUE=DURATION", "PT6H"),
  ];

  const vevents: string[] = [];
  const veventDtStamps: string[] = [];

  for (const event of input.events) {
    if (!dateInWindow(event.event_date, window)) continue;
    const category =
      input.eventTypeLabels[event.event_type] ?? event.event_type;
    const built = buildVEvent({
      uid: `event-${event.id}@hearth-home`,
      summary: sanitizeIcsText(event.title) || "Key date",
      startDate: event.event_date,
      stampSource: event.created_at,
      description: sanitizeIcsText(event.notes) || null,
      categories: category,
      url: `${input.appOrigin}/family`,
    });
    veventDtStamps.push(built.dtStamp);
    vevents.push(...built.lines);
  }

  for (const item of input.renewals) {
    if (!item.due_date || !dateInWindow(item.due_date, window)) continue;
    const personName = item.person_id
      ? peopleById.get(item.person_id) ?? null
      : null;
    const built = buildVEvent({
      uid: `renewal-${item.id}@hearth-home`,
      summary: renewalSummary(item, personName, input.renewalKindLabels),
      startDate: item.due_date,
      stampSource: item.updated_at ?? item.created_at,
      description: renewalDescription(item),
      categories: "Renewal",
      url: `${input.appOrigin}/family?renewal=${item.id}`,
      alarmDays: item.remind_days,
    });
    veventDtStamps.push(built.dtStamp);
    vevents.push(...built.lines);
  }

  for (const doc of input.documents) {
    if (doc.superseded_by) continue;
    if (linkedDocIds.has(doc.id)) continue;

    const title = documentTitle(doc) || "Document";
    const stampSource = doc.created_at;

    if (doc.renewal_date && dateInWindow(doc.renewal_date, window)) {
      const built = buildVEvent({
        uid: `doc-${doc.id}-renewal@hearth-home`,
        summary: `Renews: ${title}`,
        startDate: doc.renewal_date,
        stampSource,
        categories: "Document",
        url: `${input.appOrigin}/documents`,
      });
      veventDtStamps.push(built.dtStamp);
      vevents.push(...built.lines);
    }

    if (doc.end_date && dateInWindow(doc.end_date, window)) {
      const built = buildVEvent({
        uid: `doc-${doc.id}-end@hearth-home`,
        summary: `Ends: ${title}`,
        startDate: doc.end_date,
        stampSource,
        categories: "Document",
        url: `${input.appOrigin}/documents`,
      });
      veventDtStamps.push(built.dtStamp);
      vevents.push(...built.lines);
    }
  }

  for (const person of input.people) {
    const start = birthdayStartDate(person.birthday ?? "");
    const parts = parseDateParts(person.birthday);
    if (!start || !parts) continue;
    const built = buildVEvent({
      uid: `birthday-${person.id}@hearth-home`,
      summary: `${sanitizeIcsText(person.name)}'s birthday`,
      startDate: start,
      stampSource: person.created_at,
      categories: "Birthday",
      url: `${input.appOrigin}/family`,
      rrule: birthdayRrule(parts),
    });
    veventDtStamps.push(built.dtStamp);
    vevents.push(...built.lines);
  }

  events.push(property("DTSTAMP", maxDtStamp(veventDtStamps)));
  events.push(...vevents);
  events.push("END:VCALENDAR");

  return events.join(CRLF) + CRLF;
}

/** Assert RFC 5545 line folding — every physical line ≤ 75 UTF-8 octets. */
export function assertIcsLineFolding(ics: string): void {
  const encoder = new TextEncoder();
  for (const line of ics.split(/\r\n/)) {
    if (encoder.encode(line).length > 75) {
      throw new Error(`ICS line exceeds 75 octets: ${line.slice(0, 40)}…`);
    }
  }
  if (ics.includes("\n") && !ics.includes("\r\n")) {
    throw new Error("ICS must use CRLF line endings");
  }
}
