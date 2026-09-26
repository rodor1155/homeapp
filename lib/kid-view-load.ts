import "server-only";

import {
  APP_CALENDAR_TZ,
  calendarDayParts,
  calendarEventDate,
  nextBirthday,
  parseDateParts,
  startOfCalendarDay,
} from "@/lib/family";
import type {
  KidViewDay,
  KidViewItem,
  KidViewItemKind,
  KidViewPayload,
} from "@/lib/kid-view";
import {
  asMemberColour,
  colourAtIndex,
  type MemberColourKey,
} from "@/lib/member-colours";
import { weekdayForDate } from "@/lib/timetable";
import { createAdminClient } from "@/lib/supabase-admin";

const KID_VIEW_DAY_COUNT = 7;
const BIRTHDAY_COUNTDOWN_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

const PERSON_SELECT =
  "id, name, kind, colour, birthday, school_id, household_id, sort_order";
const EVENTS_SELECT = "id, title, event_date, event_type, person_id";
const TIMETABLE_SELECT =
  "id, person_id, weekday, start_time, end_time, period_label, subject, location, bring_kit, kit_label, bring_ingredients, ingredients_note, sort_order";
const SCHOOL_SELECT =
  "id, school_id, title, starts_at, ends_at, all_day, location";
const STATUS_SELECT = "id, person_id, status_date, status_text";

const LONDON_LONG_DATE = new Intl.DateTimeFormat("en-GB", {
  timeZone: APP_CALENDAR_TZ,
  weekday: "long",
  day: "numeric",
  month: "long",
});

function firstName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return "there";
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

function isoFromParts(parts: {
  year: number;
  month: number;
  day: number;
}): string {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function addDaysIso(isoDate: string, days: number): string | null {
  const parts = parseDateParts(isoDate);
  if (!parts) return null;
  const at = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + days)
  );
  return at.toISOString().slice(0, 10);
}

function buildDateRange(now: Date): string[] {
  const today = calendarDayParts(now);
  const start = isoFromParts(today);
  const dates: string[] = [];
  for (let i = 0; i < KID_VIEW_DAY_COUNT; i++) {
    const d = addDaysIso(start, i);
    if (d) dates.push(d);
  }
  return dates;
}

function dayLabel(isoDate: string, now: Date): string {
  const daysAway = Math.round(
    (Date.UTC(
      Number(isoDate.slice(0, 4)),
      Number(isoDate.slice(5, 7)) - 1,
      Number(isoDate.slice(8, 10))
    ) -
      startOfCalendarDay(now)) /
      DAY_MS
  );
  if (daysAway === 0) return "Today";
  if (daysAway === 1) return "Tomorrow";
  const parts = parseDateParts(isoDate);
  if (!parts) return isoDate;
  const at = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12));
  const formatted = new Intl.DateTimeFormat("en-GB", {
    timeZone: APP_CALENDAR_TZ,
    weekday: "long",
    day: "numeric",
    month: "short",
  }).format(at);
  return formatted;
}

function timeToMinutes(value: string | null): number {
  if (!value) return 9 * 60;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return 9 * 60;
  return Number(match[1]) * 60 + Number(match[2]);
}

function formatTimeHm(value: string | null): string | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  return `${match[1]}:${match[2]}`;
}

function eventIconKind(eventType: string): KidViewItemKind {
  if (eventType === "birthday") return "birthday";
  if (eventType === "school") return "school";
  return "event";
}

function sortItems(items: KidViewItem[]): KidViewItem[] {
  return [...items].sort(
    (a, b) => a.sortMinutes - b.sortMinutes || a.title.localeCompare(b.title)
  );
}

type TimetableRow = {
  id: string;
  person_id: string;
  weekday: number;
  start_time: string | null;
  end_time: string | null;
  period_label: string | null;
  subject: string;
  location: string | null;
  bring_kit: boolean;
  kit_label: string | null;
  bring_ingredients: boolean;
  ingredients_note: string | null;
  sort_order: number;
};

type SchoolRow = {
  id: string;
  school_id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  location: string | null;
};

type EventRow = {
  id: string;
  title: string;
  event_date: string;
  event_type: string;
  person_id: string | null;
};

type StatusRow = {
  id: string;
  person_id: string;
  status_date: string;
  status_text: string;
};

function expandTimetableForDay(
  slots: TimetableRow[],
  isoDate: string,
  daysAway: number
): KidViewItem[] {
  const wd = weekdayForDate(isoDate);
  if (wd == null) return [];

  const items: KidViewItem[] = [];
  for (const slot of slots) {
    if (slot.weekday !== wd) continue;
    const subject = slot.subject.trim();
    if (!subject) continue;

    const timeLabel = formatTimeHm(slot.start_time);
    const subtitle = [slot.period_label, timeLabel, slot.location]
      .filter(Boolean)
      .join(" · ");

    if (slot.bring_kit && daysAway <= 1) {
      const label = (slot.kit_label ?? "PE kit").trim() || "PE kit";
      items.push({
        kind: "kit",
        title: label,
        subtitle: daysAway === 1 ? `For ${subject} tomorrow` : subject,
        sortMinutes: daysAway === 0 ? timeToMinutes(slot.start_time) - 30 : 420,
      });
    }

    if (slot.bring_ingredients && daysAway <= 1) {
      const label =
        (slot.ingredients_note ?? `Ingredients for ${subject}`).trim() ||
        `Ingredients for ${subject}`;
      items.push({
        kind: "ingredients",
        title: label,
        subtitle: daysAway === 1 ? `For ${subject} tomorrow` : subject,
        sortMinutes: daysAway === 0 ? timeToMinutes(slot.start_time) - 20 : 430,
      });
    }

    if (daysAway === 0) {
      items.push({
        kind: "timetable",
        title: subject,
        subtitle: subtitle || null,
        sortMinutes: timeToMinutes(slot.start_time),
      });
    }
  }

  return items;
}

function schoolItemsForDay(events: SchoolRow[], isoDate: string): KidViewItem[] {
  return events
    .filter((event) => calendarEventDate(event.starts_at) === isoDate)
    .map((event) => {
      const at = new Date(event.starts_at);
      const minutes = event.all_day
        ? 12 * 60
        : Number(
            new Intl.DateTimeFormat("en-GB", {
              timeZone: APP_CALENDAR_TZ,
              hour: "numeric",
              minute: "numeric",
              hour12: false,
            })
              .formatToParts(at)
              .find((p) => p.type === "hour")?.value ?? 12
          ) *
            60 +
          Number(
            new Intl.DateTimeFormat("en-GB", {
              timeZone: APP_CALENDAR_TZ,
              minute: "numeric",
            })
              .formatToParts(at)
              .find((p) => p.type === "minute")?.value ?? 0
          );

      const timeLabel = event.all_day
        ? "All day"
        : new Intl.DateTimeFormat("en-GB", {
            timeZone: APP_CALENDAR_TZ,
            hour: "numeric",
            minute: "2-digit",
          }).format(at);

      return {
        kind: "school" as KidViewItemKind,
        title: event.title,
        subtitle: [timeLabel, event.location].filter(Boolean).join(" · ") || null,
        sortMinutes: minutes,
      };
    });
}

function eventItemsForDay(events: EventRow[], isoDate: string): KidViewItem[] {
  return events
    .filter((event) => event.event_date === isoDate)
    .map((event) => ({
      kind: eventIconKind(event.event_type),
      title: event.title,
      subtitle: null,
      sortMinutes: 10 * 60,
    }));
}

function personColourKey(
  colour: string | null,
  sortOrder: number
): MemberColourKey {
  return asMemberColour(colour) ?? colourAtIndex(sortOrder);
}

/**
 * Resolve a kid-view token and load a minimal read-only schedule for that
 * child only (today + six London days). Returns null when the token is unknown
 * or the person is no longer a child in that household.
 */
export async function loadKidViewForToken(
  token: string,
  now: Date = new Date()
): Promise<KidViewPayload | null> {
  const admin = createAdminClient();

  const { data: link } = await admin
    .from("person_kid_links")
    .select("person_id, household_id")
    .eq("token", token)
    .maybeSingle();

  if (!link?.person_id || !link?.household_id) return null;

  const personId = link.person_id as string;
  const householdId = link.household_id as string;

  const { data: person } = await admin
    .from("household_people")
    .select(PERSON_SELECT)
    .eq("id", personId)
    .eq("household_id", householdId)
    .eq("kind", "child")
    .maybeSingle();

  if (!person) return null;

  const schoolId = (person.school_id as string | null) ?? null;
  const dateRange = buildDateRange(now);
  const rangeStart = dateRange[0];
  const rangeEnd = dateRange[dateRange.length - 1];
  if (!rangeStart || !rangeEnd) return null;

  const rangeStartMs = Date.UTC(
    Number(rangeStart.slice(0, 4)),
    Number(rangeStart.slice(5, 7)) - 1,
    Number(rangeStart.slice(8, 10))
  );
  const rangeEndMs = Date.UTC(
    Number(rangeEnd.slice(0, 4)),
    Number(rangeEnd.slice(5, 7)) - 1,
    Number(rangeEnd.slice(8, 10)) + 1
  );

  const [
    eventsRes,
    timetableRes,
    statusRes,
    schoolRes,
  ] = await Promise.all([
    admin
      .from("household_events")
      .select(EVENTS_SELECT)
      .eq("household_id", householdId)
      .eq("person_id", personId)
      .gte("event_date", rangeStart)
      .lte("event_date", rangeEnd),
    admin
      .from("person_timetable_slots")
      .select(TIMETABLE_SELECT)
      .eq("household_id", householdId)
      .eq("person_id", personId)
      .order("weekday", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("start_time", { ascending: true, nullsFirst: true }),
    admin
      .from("person_day_status")
      .select(STATUS_SELECT)
      .eq("household_id", householdId)
      .eq("person_id", personId)
      .gte("status_date", rangeStart)
      .lte("status_date", rangeEnd),
    schoolId
      ? admin
          .from("school_calendar_events")
          .select(SCHOOL_SELECT)
          .eq("household_id", householdId)
          .eq("school_id", schoolId)
          .gte("starts_at", new Date(rangeStartMs).toISOString())
          .lt("starts_at", new Date(rangeEndMs).toISOString())
          .order("starts_at", { ascending: true })
      : Promise.resolve({ data: [] as SchoolRow[], error: null }),
  ]);

  const events = (eventsRes.data ?? []) as EventRow[];
  const slots = ((timetableRes.data ?? []) as TimetableRow[]).map((row) => ({
    ...row,
    bring_kit: Boolean(row.bring_kit),
    bring_ingredients: Boolean(row.bring_ingredients),
  }));
  const statuses = (statusRes.data ?? []) as StatusRow[];
  const schoolEvents = (schoolRes.data ?? []) as SchoolRow[];

  const statusByDate = new Map(
    statuses.map((row) => [row.status_date, row.status_text.trim()])
  );

  const birthday = nextBirthday(person.birthday as string | null, now);
  const birthdayCountdown =
    birthday &&
    birthday.daysAway >= 0 &&
    birthday.daysAway <= BIRTHDAY_COUNTDOWN_DAYS
      ? { sleeps: birthday.daysAway, date: birthday.date }
      : null;

  const todayIso = rangeStart;
  const days: KidViewDay[] = dateRange.map((isoDate) => {
    const daysAway = Math.round(
      (Date.UTC(
        Number(isoDate.slice(0, 4)),
        Number(isoDate.slice(5, 7)) - 1,
        Number(isoDate.slice(8, 10))
      ) -
        startOfCalendarDay(now)) /
        DAY_MS
    );

    const items = sortItems([
      ...expandTimetableForDay(slots, isoDate, daysAway),
      ...eventItemsForDay(events, isoDate),
      ...schoolItemsForDay(schoolEvents, isoDate),
      ...(birthday?.date === isoDate
        ? [
            {
              kind: "birthday" as KidViewItemKind,
              title: "Your birthday!",
              subtitle: null,
              sortMinutes: 8 * 60,
            },
          ]
        : []),
    ]);

    const whosWhere = statusByDate.get(isoDate) || null;

    return {
      date: isoDate,
      label: dayLabel(isoDate, now),
      isToday: isoDate === todayIso,
      whosWhere: whosWhere || null,
      items,
    };
  });

  return {
    firstName: firstName(person.name as string),
    colour: personColourKey(
      person.colour as string | null,
      Number(person.sort_order ?? 0)
    ),
    birthdayCountdown,
    todayLabel: LONDON_LONG_DATE.format(now),
    days,
  };
}
