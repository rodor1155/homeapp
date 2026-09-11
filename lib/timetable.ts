// School timetable slots for a child. Client-safe: shapes, loaders, and the
// expansion that turns a Mon–Fri week into Coming up / calendar rows.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  calendarDayParts,
  daysUntil,
  type FamilyList,
  type HouseholdPerson,
} from "@/lib/family";

/** 0 = Monday … 6 = Sunday (ISO weekday − 1). */
export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const WEEKDAY_LABEL: Record<Weekday, string> = {
  0: "Monday",
  1: "Tuesday",
  2: "Wednesday",
  3: "Thursday",
  4: "Friday",
  5: "Saturday",
  6: "Sunday",
};

export const WEEKDAY_SHORT: Record<Weekday, string> = {
  0: "Mon",
  1: "Tue",
  2: "Wed",
  3: "Thu",
  4: "Fri",
  5: "Sat",
  6: "Sun",
};

export function asWeekday(value: unknown): Weekday | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 6) return null;
  return n as Weekday;
}

/** HH:MM or null. */
export function asTimeHm(value: unknown): string | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export type PersonTimetableSlot = {
  id: string;
  person_id: string;
  weekday: Weekday;
  start_time: string | null;
  end_time: string | null;
  period_label: string | null;
  subject: string;
  location: string | null;
  bring_kit: boolean;
  kit_label: string | null;
  bring_ingredients: boolean;
  ingredients_note: string | null;
  notes: string | null;
  source_document_id: string | null;
  sort_order: number;
};

export const TIMETABLE_SELECT =
  "id, person_id, weekday, start_time, end_time, period_label, subject, location, bring_kit, kit_label, bring_ingredients, ingredients_note, notes, source_document_id, sort_order";

function listOk<T>(items: T[]): FamilyList<T> {
  return { items, fault: null };
}

function listFault<T>(label: string, message: string): FamilyList<T> {
  console.error(`[timetable] ${label}`, message);
  return {
    items: [],
    fault: "We couldn’t load this just now. Try refreshing the page.",
  };
}

export async function loadPersonTimetableSlots(
  supabase: SupabaseClient,
  householdId: string,
  personId?: string
): Promise<FamilyList<PersonTimetableSlot>> {
  let query = supabase
    .from("person_timetable_slots")
    .select(TIMETABLE_SELECT)
    .eq("household_id", householdId)
    .order("weekday", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("start_time", { ascending: true, nullsFirst: true });

  if (personId) query = query.eq("person_id", personId);

  const { data, error } = await query;
  if (error) return listFault("loadPersonTimetableSlots", error.message);

  const items = ((data as PersonTimetableSlot[] | null) ?? []).map((row) => ({
    ...row,
    weekday: asWeekday(row.weekday) ?? 0,
    bring_kit: Boolean(row.bring_kit),
    bring_ingredients: Boolean(row.bring_ingredients),
  }));
  return listOk(items);
}

/** Draft slot used by the editor / extract review before confirm. */
export type TimetableSlotDraft = {
  weekday: Weekday;
  start_time: string | null;
  end_time: string | null;
  period_label: string | null;
  subject: string;
  location: string | null;
  bring_kit: boolean;
  kit_label: string | null;
  bring_ingredients: boolean;
  ingredients_note: string | null;
  notes: string | null;
  sort_order: number;
};

/**
 * Guess kit / ingredients flags from a subject name when the scan didn't set
 * them. UK secondary: PE / Games → kit; Food Tech / Cooking → ingredients.
 */
export function inferKitFlags(subject: string): {
  bring_kit: boolean;
  kit_label: string | null;
  bring_ingredients: boolean;
  ingredients_note: string | null;
} {
  const s = subject.trim().toLowerCase();
  if (!s) {
    return {
      bring_kit: false,
      kit_label: null,
      bring_ingredients: false,
      ingredients_note: null,
    };
  }

  const isPe =
    /\b(p\.?\s*e\.?|physical education|games|sport|athletics|swimming)\b/i.test(
      s
    ) || s === "pe";
  const isTextiles = /\b(textiles?|dt textiles)\b/i.test(s);
  const isFood =
    /\b(food( tech(nology)?)?|cooking|home economics|hospitality)\b/i.test(s);

  if (isPe) {
    return {
      bring_kit: true,
      kit_label: "PE kit",
      bring_ingredients: false,
      ingredients_note: null,
    };
  }
  if (isTextiles) {
    return {
      bring_kit: true,
      kit_label: "Textiles kit",
      bring_ingredients: false,
      ingredients_note: null,
    };
  }
  if (isFood) {
    return {
      bring_kit: false,
      kit_label: null,
      bring_ingredients: true,
      ingredients_note: "Ingredients for Food Tech",
    };
  }
  return {
    bring_kit: false,
    kit_label: null,
    bring_ingredients: false,
    ingredients_note: null,
  };
}

/** How far ahead kit / ingredients reminders are worth listing. */
export const TIMETABLE_HORIZON_DAYS = 14;

export type TimetableComingUp = {
  key: string;
  /** Lesson calendar date (YYYY-MM-DD), Europe/London. */
  date: string;
  daysAway: number;
  title: string;
  note: string;
  personId: string;
  slotId: string;
  kind: "kit" | "ingredients" | "lesson";
};

function isoDateFromParts(year: number, month: number, day: number): string {
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.toISOString().slice(0, 10);
}

/** London weekday as 0=Mon … 6=Sun for a YYYY-MM-DD. */
export function weekdayForDate(isoDate: string): Weekday | null {
  const parts = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!parts) return null;
  const at = new Date(
    Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]))
  );
  // getUTCDay: 0=Sun … 6=Sat → ISO Mon=0
  const sun0 = at.getUTCDay();
  return ((sun0 + 6) % 7) as Weekday;
}

function addDaysIso(isoDate: string, days: number): string | null {
  const parts = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!parts) return null;
  const at = new Date(
    Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]) + days)
  );
  return at.toISOString().slice(0, 10);
}

/**
 * Expand confirmed slots into Coming up rows for the next N London days.
 * Kit / ingredients surface the evening before and on the morning of
 * (daysAway 0–1 relative to the lesson). Lessons themselves only appear on
 * the day, and only when they don't already have a kit/ingredients flag —
 * so PE reads as "PE kit" rather than twice.
 */
export function timetableComingUpEntries(
  slots: readonly PersonTimetableSlot[],
  people: readonly HouseholdPerson[],
  now: Date = new Date(),
  withinDays: number = TIMETABLE_HORIZON_DAYS
): TimetableComingUp[] {
  if (slots.length === 0) return [];

  const nameById = new Map(people.map((p) => [p.id, p.name]));
  const todayParts = calendarDayParts(now);
  const todayIso = isoDateFromParts(
    todayParts.year,
    todayParts.month,
    todayParts.day
  );

  const byWeekday = new Map<Weekday, PersonTimetableSlot[]>();
  for (const slot of slots) {
    const list = byWeekday.get(slot.weekday) ?? [];
    list.push(slot);
    byWeekday.set(slot.weekday, list);
  }

  const entries: TimetableComingUp[] = [];

  for (let offset = 0; offset <= withinDays; offset++) {
    const date = addDaysIso(todayIso, offset);
    if (!date) continue;
    const wd = weekdayForDate(date);
    if (wd == null) continue;
    const daySlots = byWeekday.get(wd);
    if (!daySlots) continue;

    for (const slot of daySlots) {
      const who = nameById.get(slot.person_id) ?? "Child";
      const daysAway = daysUntil(date, now);
      if (daysAway === null || daysAway < 0) continue;

      const when =
        daysAway === 0 ? "today" : daysAway === 1 ? "tomorrow" : null;

      if (slot.bring_kit && daysAway <= 1) {
        const label = (slot.kit_label ?? "PE kit").trim() || "PE kit";
        entries.push({
          key: `timetable-kit-${slot.id}-${date}`,
          date,
          daysAway,
          title: when ? `${label} ${when}` : label,
          note: [who, slot.subject].filter(Boolean).join(" · "),
          personId: slot.person_id,
          slotId: slot.id,
          kind: "kit",
        });
      }

      if (slot.bring_ingredients && daysAway <= 1) {
        const label =
          (slot.ingredients_note ?? `Ingredients for ${slot.subject}`).trim() ||
          `Ingredients for ${slot.subject}`;
        entries.push({
          key: `timetable-ing-${slot.id}-${date}`,
          date,
          daysAway,
          title: when ? `${label} ${when}` : label,
          note: [who, slot.subject].filter(Boolean).join(" · "),
          personId: slot.person_id,
          slotId: slot.id,
          kind: "ingredients",
        });
      }

      // Plain lesson on the day only, when it isn't already a kit/ingredients cue.
      if (
        daysAway === 0 &&
        !slot.bring_kit &&
        !slot.bring_ingredients &&
        slot.subject.trim()
      ) {
        entries.push({
          key: `timetable-lesson-${slot.id}-${date}`,
          date,
          daysAway,
          title: `${slot.subject} today`,
          note: [
            who,
            slot.period_label || slot.start_time,
            slot.location,
          ]
            .filter(Boolean)
            .join(" · "),
          personId: slot.person_id,
          slotId: slot.id,
          kind: "lesson",
        });
      }
    }
  }

  return entries.sort(
    (a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title)
  );
}

/** Calendar items for a month window — every lesson occurrence in range. */
export function timetableCalendarItems(
  slots: readonly PersonTimetableSlot[],
  people: readonly HouseholdPerson[],
  fromIso: string,
  toIso: string
): {
  key: string;
  date: string;
  title: string;
  note: string;
  personId: string;
}[] {
  if (slots.length === 0) return [];
  const nameById = new Map(people.map((p) => [p.id, p.name]));
  const items: {
    key: string;
    date: string;
    title: string;
    note: string;
    personId: string;
  }[] = [];

  let cursor = fromIso;
  // Cap iterations so a bad range can't loop forever.
  for (let i = 0; i < 62; i++) {
    if (cursor > toIso) break;
    const wd = weekdayForDate(cursor);
    if (wd != null) {
      for (const slot of slots) {
        if (slot.weekday !== wd) continue;
        const who = nameById.get(slot.person_id) ?? "Child";
        const extras: string[] = [];
        if (slot.bring_kit) extras.push(slot.kit_label?.trim() || "kit");
        if (slot.bring_ingredients) extras.push("ingredients");
        items.push({
          key: `timetable-${slot.id}-${cursor}`,
          date: cursor,
          title: slot.subject,
          note: [who, slot.period_label || slot.start_time, ...extras]
            .filter(Boolean)
            .join(" · "),
          personId: slot.person_id,
        });
      }
    }
    const next = addDaysIso(cursor, 1);
    if (!next) break;
    cursor = next;
  }

  return items;
}

export function slotsForPerson(
  slots: readonly PersonTimetableSlot[],
  personId: string
): PersonTimetableSlot[] {
  return slots.filter((s) => s.person_id === personId);
}

export function groupSlotsByWeekday(
  slots: readonly PersonTimetableSlot[]
): Record<Weekday, PersonTimetableSlot[]> {
  const out = {
    0: [],
    1: [],
    2: [],
    3: [],
    4: [],
    5: [],
    6: [],
  } as Record<Weekday, PersonTimetableSlot[]>;
  for (const slot of slots) {
    out[slot.weekday].push(slot);
  }
  return out;
}
