// Sunday "Your week ahead" briefing — client-safe window logic and templating.

import type { ComingUpEntry } from "@/lib/coming-up";
import { calendarDayParts, daysUntil, type HouseholdPerson } from "@/lib/family";
import type { Locale } from "@/lib/household";
import { intlLocale } from "@/lib/dates";
import {
  memberColourVar,
  personColour,
  type MemberColourKey,
} from "@/lib/member-colours";
import { WEEKDAY_LABEL, weekdayForDate } from "@/lib/timetable";

const LONDON_TZ = "Europe/London";

const BUSY_THRESHOLD = 5;
const QUIET_THRESHOLD = 1;

export type WeekAheadRange = {
  monday: string;
  sunday: string;
};

export type WeekAheadPersonItem = {
  title: string;
  entry: ComingUpEntry;
};

export type WeekAheadPersonLine = {
  personId: string;
  name: string;
  colour: MemberColourKey;
  items: WeekAheadPersonItem[];
  moreCount: number;
};

export type WeekAheadBirthday = {
  personId: string;
  name: string;
  date: string;
  turning: number;
  weekdayLabel: string;
  label: string;
};

export type WeekAheadRoutineLine = {
  title: string;
  date: string;
  weekdayLabel: string;
  label: string;
};

export type WeekAheadCompactLine =
  | {
      kind: "person";
      personId: string;
      colour: MemberColourKey;
      label: string;
    }
  | { kind: "renewal"; label: string }
  | { kind: "birthday"; label: string };

export type WeekAheadDay = {
  date: string;
  weekdayLabel: string;
  entries: ComingUpEntry[];
};

export type WeekAheadModel = {
  range: WeekAheadRange;
  rangeLabel: string;
  headline: string;
  ariaLabel: string;
  totalCount: number;
  renewalCount: number;
  birthdayCount: number;
  compactLines: WeekAheadCompactLine[];
  people: WeekAheadPersonLine[];
  birthdays: WeekAheadBirthday[];
  routines: WeekAheadRoutineLine[];
  renewals: ComingUpEntry[];
  days: WeekAheadDay[];
  calendarHref: string;
};

export type WeekAheadInput = {
  entries: readonly ComingUpEntry[];
  people: readonly HouseholdPerson[];
  locale: Locale;
  /** school calendar event id → school_id for assigning rows to children. */
  schoolByEventId?: ReadonlyMap<string, string>;
};

type CivilDateParts = { year: number; month: number; day: number };

const DAY_MS = 24 * 60 * 60 * 1000;

function formatIsoDate(parts: CivilDateParts): string {
  const month = String(parts.month).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");
  return `${parts.year}-${month}-${day}`;
}

function parseIsoDate(iso: string): CivilDateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const parts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
  return parts.month >= 1 &&
    parts.month <= 12 &&
    parts.day >= 1 &&
    parts.day <= 31
    ? parts
    : null;
}

/** Whole-day offset on a stored YYYY-MM-DD (UTC civil math, not local midnight). */
function addDaysIso(iso: string, days: number): string {
  const parts = parseIsoDate(iso);
  if (!parts) return iso;
  const at = Date.UTC(parts.year, parts.month - 1, parts.day) + days * DAY_MS;
  const shifted = new Date(at);
  return formatIsoDate({
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  });
}

function londonTodayIso(now: Date): string {
  const { year, month, day } = calendarDayParts(now, LONDON_TZ);
  return formatIsoDate({ year, month, day });
}

/** Monday=0 … Sunday=6 for a YYYY-MM-DD string. */
function isoWeekday(iso: string): number {
  const parts = parseIsoDate(iso);
  if (!parts) return 0;
  const sun0 = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
  return (sun0 + 6) % 7;
}

function londonHour(now: Date): number {
  const hourParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: LONDON_TZ,
    hour: "numeric",
    hour12: false,
  }).formatToParts(now);
  return Number(hourParts.find((p) => p.type === "hour")?.value ?? 0);
}

/** Saturday 17:00 – Sunday 23:59, and Monday before 12:00 (Europe/London). */
export function isWeekAheadWindow(now: Date = new Date()): boolean {
  const weekday = isoWeekday(londonTodayIso(now));
  const hour = londonHour(now);
  if (weekday === 5) return hour >= 17;
  if (weekday === 6) return true;
  if (weekday === 0) return hour < 12;
  return false;
}

/**
 * The Mon–Sun week the briefing covers. On Monday morning that is the current
 * week; on Saturday evening and Sunday it is the week about to start.
 */
export function weekAheadRange(now: Date = new Date()): WeekAheadRange {
  const today = londonTodayIso(now);
  const weekday = isoWeekday(today);
  const hour = londonHour(now);

  let monday: string;
  if (weekday === 0 && hour < 12) {
    monday = today;
  } else {
    const daysUntilMonday = weekday === 0 ? 7 : 7 - weekday;
    monday = addDaysIso(today, daysUntilMonday);
  }

  return { monday, sunday: addDaysIso(monday, 6) };
}

/** Days from now to the end of the target week — for extending Coming up horizons. */
export function weekAheadHorizonDays(now: Date = new Date()): number {
  const range = weekAheadRange(now);
  const toSunday = daysUntil(range.sunday, now);
  return Math.max((toSunday ?? 0) + 1, 7);
}

function inRange(date: string, range: WeekAheadRange): boolean {
  return date >= range.monday && date <= range.sunday;
}

function formatWeekRangeLabel(
  monday: string,
  sunday: string,
  locale: Locale
): string {
  const fmt = new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  const m = new Date(`${monday}T00:00:00Z`);
  const s = new Date(`${sunday}T00:00:00Z`);
  return `${fmt.format(m)} – ${fmt.format(s)}`;
}

function weekdayLabel(date: string): string {
  const wd = weekdayForDate(date);
  return wd == null ? "" : WEEKDAY_LABEL[wd];
}

function isNotableTimetable(entry: ComingUpEntry): boolean {
  if (entry.kind !== "timetable") return false;
  return (
    entry.key.includes("timetable-kit-") ||
    entry.key.includes("timetable-ing-")
  );
}

function schoolIdForEntry(
  entry: ComingUpEntry,
  schoolByEventId?: ReadonlyMap<string, string>
): string | null {
  if (entry.kind !== "school" || !entry.recordId) return null;
  return schoolByEventId?.get(entry.recordId) ?? null;
}

function personIdsForEntry(
  entry: ComingUpEntry,
  people: readonly HouseholdPerson[],
  schoolByEventId?: ReadonlyMap<string, string>
): string[] {
  if (entry.personId) return [entry.personId];

  const schoolId = schoolIdForEntry(entry, schoolByEventId);
  if (!schoolId) return [];

  return people
    .filter((p) => p.school_id === schoolId)
    .map((p) => p.id);
}

function isPersonKeyItem(entry: ComingUpEntry): boolean {
  if (entry.kind === "event" || entry.kind === "renewal" || entry.kind === "school") {
    return true;
  }
  if (entry.kind === "timetable") return isNotableTimetable(entry);
  return false;
}

function headlineFor(total: number, renewalCount: number): string {
  if (total === 0) return "Nothing planned yet";

  const things =
    total === 1 ? "1 thing" : `${total} things`;

  let line: string;
  if (total >= BUSY_THRESHOLD) {
    line = `A busy week: ${things}`;
  } else if (total >= QUIET_THRESHOLD) {
    line = `A quiet week: ${things}`;
  } else {
    line = `A quiet week: ${things}`;
  }

  if (renewalCount > 0) {
    const renewals =
      renewalCount === 1 ? "1 renewal due" : `${renewalCount} renewals due`;
    line = `${line}, ${renewals}`;
  }

  return line;
}

function routineLabel(title: string, weekday: string): string {
  const lower = title.toLowerCase();
  if (lower.includes("bin")) return `Bins: ${weekday}`;
  return `${title}: ${weekday}`;
}

export function buildWeekAhead(
  input: WeekAheadInput,
  range: WeekAheadRange
): WeekAheadModel {
  const { entries, people, locale, schoolByEventId } = input;

  const weekEntries = entries
    .filter((e) => inRange(e.date, range))
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) || a.title.localeCompare(b.title)
    );

  const renewals = weekEntries.filter((e) => e.kind === "renewal");
  const birthdays = weekEntries.filter((e) => e.kind === "birthday");
  const routines = weekEntries.filter((e) => e.kind === "routine");

  const birthdayLines: WeekAheadBirthday[] = birthdays.map((entry) => {
    const person = people.find((p) => p.id === entry.personId);
    const name = person?.name ?? entry.title.replace(/['']s birthday$/, "");
    const turningMatch = /Turns (\d+)/.exec(entry.note);
    const turning = turningMatch ? Number(turningMatch[1]) : 0;
    const wd = weekdayLabel(entry.date);
    return {
      personId: entry.personId ?? "",
      name,
      date: entry.date,
      turning,
      weekdayLabel: wd,
      label: `${name} turns ${turning} on ${wd}`,
    };
  });

  const routineLines: WeekAheadRoutineLine[] = routines.map((entry) => {
    const wd = weekdayLabel(entry.date);
    return {
      title: entry.title,
      date: entry.date,
      weekdayLabel: wd,
      label: routineLabel(entry.title, wd),
    };
  });

  const condensedRoutines = condenseRoutines(routineLines);

  const byPerson = new Map<string, WeekAheadPersonItem[]>();
  for (const entry of weekEntries) {
    if (entry.kind === "birthday" || entry.kind === "routine") continue;
    if (entry.kind === "document" || entry.kind === "shared") continue;
    if (!isPersonKeyItem(entry)) continue;

    const ids = personIdsForEntry(entry, people, schoolByEventId);
    if (ids.length === 0) continue;

    for (const personId of ids) {
      const list = byPerson.get(personId) ?? [];
      list.push({ title: entry.title, entry });
      byPerson.set(personId, list);
    }
  }

  const peopleLines: WeekAheadPersonLine[] = [...people]
    .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id))
    .map((person) => {
      const items = byPerson.get(person.id) ?? [];
      const shown = items.slice(0, 2);
      const moreCount = Math.max(0, items.length - shown.length);
      return {
        personId: person.id,
        name: person.name,
        colour: personColour(person, people),
        items: shown,
        moreCount,
      };
    })
    .filter((line) => line.items.length > 0 || line.moreCount > 0);

  const totalCount = weekEntries.length;
  const renewalCount = renewals.length;
  const birthdayCount = birthdayLines.length;
  const headline = headlineFor(totalCount, renewalCount);

  const compactLines = buildCompactLines(
    peopleLines,
    renewals,
    birthdayLines
  );

  const days: WeekAheadDay[] = [];
  for (let i = 0; i < 7; i++) {
    const date = addDaysIso(range.monday, i);
    const dayEntries = weekEntries.filter((e) => e.date === date);
    days.push({
      date,
      weekdayLabel: weekdayLabel(date),
      entries: dayEntries,
    });
  }

  const rangeLabel = formatWeekRangeLabel(range.monday, range.sunday, locale);

  return {
    range,
    rangeLabel,
    headline,
    ariaLabel: `Your week ahead. ${headline}. ${rangeLabel}.`,
    totalCount,
    renewalCount,
    birthdayCount,
    compactLines,
    people: peopleLines,
    birthdays: birthdayLines,
    routines: condensedRoutines,
    renewals,
    days,
    calendarHref: `/calendar?date=${range.monday}`,
  };
}

function condenseRoutines(lines: WeekAheadRoutineLine[]): WeekAheadRoutineLine[] {
  const byTitle = new Map<string, WeekAheadRoutineLine[]>();
  for (const line of lines) {
    const key = line.title.toLowerCase();
    const list = byTitle.get(key) ?? [];
    list.push(line);
    byTitle.set(key, list);
  }

  const out: WeekAheadRoutineLine[] = [];
  for (const group of byTitle.values()) {
    if (group.length === 1) {
      out.push(group[0]!);
      continue;
    }
    const weekdays = group.map((g) => g.weekdayLabel).join(", ");
    const first = group[0]!;
    out.push({
      ...first,
      label: routineLabel(first.title, weekdays),
    });
  }
  return out;
}

function buildCompactLines(
  peopleLines: WeekAheadPersonLine[],
  renewals: ComingUpEntry[],
  birthdayLines: WeekAheadBirthday[]
): WeekAheadCompactLine[] {
  const lines: WeekAheadCompactLine[] = [];

  const pushPerson = (person: WeekAheadPersonLine) => {
    const first = person.items[0];
    if (!first || lines.length >= 3) return;
    lines.push({
      kind: "person",
      personId: person.personId,
      colour: person.colour,
      label: `${person.name} · ${first.title}`,
    });
  };

  if (peopleLines[0]) pushPerson(peopleLines[0]);

  if (renewals.length > 0 && lines.length < 3) {
    const renewal = renewals[0]!;
    lines.push({
      kind: "renewal",
      label: `${renewal.title} due ${weekdayLabel(renewal.date)}`,
    });
  }

  if (birthdayLines.length > 0 && lines.length < 3) {
    lines.push({
      kind: "birthday",
      label: birthdayLines[0]!.label,
    });
  }

  for (const person of peopleLines.slice(1)) {
    pushPerson(person);
  }

  return lines.slice(0, 3);
}

export function weekAheadCardTint(): string {
  return memberColourVar("amber");
}
