import "server-only";

import {
  CalendarError,
  normaliseCalendarUrl,
  readCalendarFeed,
  type ParsedCalendar,
  type ParsedCalendarEvent,
} from "@/lib/ics";
import { createAdminClient } from "@/lib/supabase-admin";

/* A calendar the household shares, linked as an ICS feed: the family Google
 * calendar, a club's fixtures, a shared rota.
 *
 * The same shape as lib/school-calendar.ts one level up — the fetch, the URL
 * rules and the parse are the shared ones in lib/ics.ts, and all that differs
 * is which table the occurrences are cached in and which row carries the
 * "last read" marks. `household_calendar_events` has no insert policy, so
 * every write here goes through the admin client. */

export type HouseholdCalendarSync = {
  calendarId: string;
  /** Occurrences now cached. Zero is a perfectly good answer. */
  count: number;
  /** A sentence for the household, or null if it went through. */
  error: string | null;
};

/** One in-flight sync per calendar so a double-tap on Refresh can't race. */
const inflight = new Map<string, Promise<HouseholdCalendarSync>>();

/**
 * Fetches one of the household's feeds and refreshes its cached occurrences
 * without wiping first. Upserts by uid, then drops orphans — a failed insert
 * leaves the previous rows alone.
 */
export async function syncHouseholdCalendar(
  calendarId: string,
  now: Date = new Date()
): Promise<HouseholdCalendarSync> {
  const existing = inflight.get(calendarId);
  if (existing) return existing;

  const run = syncHouseholdCalendarInner(calendarId, now).finally(() => {
    if (inflight.get(calendarId) === run) inflight.delete(calendarId);
  });
  inflight.set(calendarId, run);
  return run;
}

async function syncHouseholdCalendarInner(
  calendarId: string,
  now: Date
): Promise<HouseholdCalendarSync> {
  const supabase = createAdminClient();

  const { data: calendar, error: loadErr } = await supabase
    .from("household_calendars")
    .select("id, household_id, calendar_url, calendar_title")
    .eq("id", calendarId)
    .maybeSingle();

  if (loadErr || !calendar) {
    return {
      calendarId,
      count: 0,
      error: "We couldn’t find that calendar.",
    };
  }

  const householdId = calendar.household_id as string;
  const rawUrl = (calendar.calendar_url as string | null) ?? "";

  if (!rawUrl.trim()) {
    await supabase
      .from("household_calendar_events")
      .delete()
      .eq("calendar_id", calendarId);
    await supabase
      .from("household_calendars")
      .update({ calendar_last_synced_at: null, calendar_last_error: null })
      .eq("id", calendarId);
    return { calendarId, count: 0, error: null };
  }

  const normalised = normaliseCalendarUrl(rawUrl);
  if ("error" in normalised) {
    return recordFailure(supabase, calendarId, normalised.error);
  }

  let parsed: ParsedCalendar;
  try {
    parsed = await readCalendarFeed(normalised.url, now);
  } catch (error) {
    const message =
      error instanceof CalendarError
        ? error.message
        : "We couldn’t read that calendar.";
    if (!(error instanceof CalendarError)) {
      console.error("[household-calendar] sync failed", calendarId, error);
    }
    return recordFailure(supabase, calendarId, message);
  }

  const replaced = await replaceHouseholdEvents(
    supabase,
    calendarId,
    householdId,
    parsed.events
  );
  if (!replaced.ok) {
    return recordFailure(supabase, calendarId, "We couldn’t save that calendar.");
  }

  // The feed's own name only fills `calendar_title`, never `name` — the
  // household named the calendar itself and that always wins.
  const patch: Record<string, unknown> = {
    calendar_last_synced_at: now.toISOString(),
    calendar_last_error: null,
  };
  if (!(calendar.calendar_title as string | null)?.trim() && parsed.title) {
    patch.calendar_title = parsed.title.slice(0, 200);
  }
  await supabase.from("household_calendars").update(patch).eq("id", calendarId);

  return { calendarId, count: parsed.events.length, error: null };
}

async function replaceHouseholdEvents(
  supabase: AdminClient,
  calendarId: string,
  householdId: string,
  events: ParsedCalendarEvent[]
): Promise<{ ok: boolean }> {
  const rows = events.map((event) => ({
    calendar_id: calendarId,
    household_id: householdId,
    uid: stableEventUid(event),
    title: event.title,
    starts_at: event.startsAt,
    ends_at: event.endsAt,
    all_day: event.allDay,
    location: event.location,
  }));
  const keep = new Set(rows.map((row) => row.uid));

  if (rows.length > 0) {
    const { error: upsertErr } = await supabase
      .from("household_calendar_events")
      .upsert(rows, { onConflict: "calendar_id,uid" });
    if (upsertErr) {
      console.error("[household-calendar] upsert failed", calendarId, upsertErr);
      return { ok: false };
    }
  }

  const { data: existing, error: listErr } = await supabase
    .from("household_calendar_events")
    .select("id, uid")
    .eq("calendar_id", calendarId);
  if (listErr) {
    console.error("[household-calendar] list for prune failed", calendarId, listErr);
    return { ok: true };
  }

  const toDelete = (existing ?? [])
    .filter((row) => !keep.has(row.uid as string))
    .map((row) => row.id as string);
  if (toDelete.length > 0) {
    const { error: deleteErr } = await supabase
      .from("household_calendar_events")
      .delete()
      .in("id", toDelete);
    if (deleteErr) {
      console.error("[household-calendar] prune failed", calendarId, deleteErr);
    }
  }

  return { ok: true };
}

function stableEventUid(event: ParsedCalendarEvent): string {
  if (event.uid?.trim()) return event.uid.trim().slice(0, 500);
  return `~${event.startsAt}|${event.title}|${event.location ?? ""}`.slice(0, 500);
}

type AdminClient = ReturnType<typeof createAdminClient>;

async function recordFailure(
  supabase: AdminClient,
  calendarId: string,
  message: string
): Promise<HouseholdCalendarSync> {
  await supabase
    .from("household_calendars")
    .update({ calendar_last_error: message })
    .eq("id", calendarId);
  return { calendarId, count: 0, error: message };
}
