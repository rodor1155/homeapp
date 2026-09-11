import "server-only";

import {
  CalendarError,
  normaliseCalendarUrl,
  readCalendarFeed,
  type ParsedCalendar,
  type ParsedCalendarEvent,
} from "@/lib/ics";
import { createAdminClient } from "@/lib/supabase-admin";

/* A school's term calendar, linked as an ICS feed.
 *
 * The careful part — which URLs we are willing to store, the capped fetch, the
 * parse — is feed-agnostic and lives in lib/ics.ts, shared with the
 * household's own calendars. What is left here is the school's half of it: the
 * occurrences are cached in `school_calendar_events`, which has no insert
 * policy, so every write goes through the admin client, the same arrangement
 * `reminders` uses. */

export type SchoolCalendarSync = {
  schoolId: string;
  /** Occurrences now cached. Zero is a perfectly good answer. */
  count: number;
  /** A sentence for the household, or null if it went through. */
  error: string | null;
};

/** One in-flight sync per school so a double-tap on Refresh can't race deletes. */
const inflight = new Map<string, Promise<SchoolCalendarSync>>();

/**
 * Fetches a school's feed and refreshes its cached occurrences without wiping
 * first. Upserts by uid, then drops orphans — a failed insert leaves the
 * previous rows alone, matching what the page claims.
 */
export async function syncSchoolCalendar(
  schoolId: string,
  now: Date = new Date()
): Promise<SchoolCalendarSync> {
  const existing = inflight.get(schoolId);
  if (existing) return existing;

  const run = syncSchoolCalendarInner(schoolId, now).finally(() => {
    if (inflight.get(schoolId) === run) inflight.delete(schoolId);
  });
  inflight.set(schoolId, run);
  return run;
}

async function syncSchoolCalendarInner(
  schoolId: string,
  now: Date
): Promise<SchoolCalendarSync> {
  const supabase = createAdminClient();

  const { data: school, error: loadErr } = await supabase
    .from("schools")
    .select("id, household_id, calendar_url, calendar_title")
    .eq("id", schoolId)
    .maybeSingle();

  if (loadErr || !school) {
    return {
      schoolId,
      count: 0,
      error: "We couldn’t find that school.",
    };
  }

  const householdId = school.household_id as string;
  const rawUrl = (school.calendar_url as string | null) ?? "";

  // No feed linked: clear the cache and the last-sync marks, so removing a
  // calendar leaves nothing behind.
  if (!rawUrl.trim()) {
    await supabase.from("school_calendar_events").delete().eq("school_id", schoolId);
    await supabase
      .from("schools")
      .update({ calendar_last_synced_at: null, calendar_last_error: null })
      .eq("id", schoolId);
    return { schoolId, count: 0, error: null };
  }

  const normalised = normaliseCalendarUrl(rawUrl);
  if ("error" in normalised) {
    return recordFailure(supabase, schoolId, normalised.error);
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
      console.error("[school-calendar] sync failed", schoolId, error);
    }
    return recordFailure(supabase, schoolId, message);
  }

  const replaced = await replaceSchoolEvents(
    supabase,
    schoolId,
    householdId,
    parsed.events
  );
  if (!replaced.ok) {
    return recordFailure(supabase, schoolId, "We couldn’t save that calendar.");
  }

  // The feed's own name is only borrowed when nobody has named the calendar
  // themselves — what the household typed always wins.
  const patch: Record<string, unknown> = {
    calendar_last_synced_at: now.toISOString(),
    calendar_last_error: null,
  };
  if (!(school.calendar_title as string | null)?.trim() && parsed.title) {
    patch.calendar_title = parsed.title.slice(0, 200);
  }
  await supabase.from("schools").update(patch).eq("id", schoolId);

  return { schoolId, count: parsed.events.length, error: null };
}

/**
 * Upsert-by-uid, then delete orphans. Never deletes before the write lands, so
 * a failed save keeps whatever was already on the dashboard.
 */
async function replaceSchoolEvents(
  supabase: AdminClient,
  schoolId: string,
  householdId: string,
  events: ParsedCalendarEvent[]
): Promise<{ ok: boolean }> {
  const rows = events.map((event) => ({
    school_id: schoolId,
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
      .from("school_calendar_events")
      .upsert(rows, { onConflict: "school_id,uid" });
    if (upsertErr) {
      console.error("[school-calendar] upsert failed", schoolId, upsertErr);
      return { ok: false };
    }
  }

  const { data: existing, error: listErr } = await supabase
    .from("school_calendar_events")
    .select("id, uid")
    .eq("school_id", schoolId);
  if (listErr) {
    console.error("[school-calendar] list for prune failed", schoolId, listErr);
    // Upsert already landed — extras are better than an empty Coming up.
    return { ok: true };
  }

  const toDelete = (existing ?? [])
    .filter((row) => !keep.has(row.uid as string))
    .map((row) => row.id as string);
  if (toDelete.length > 0) {
    const { error: deleteErr } = await supabase
      .from("school_calendar_events")
      .delete()
      .in("id", toDelete);
    if (deleteErr) {
      console.error("[school-calendar] prune failed", schoolId, deleteErr);
    }
  }

  return { ok: true };
}

/** Every cached row needs a uid for the unique key; synthesise a stable one. */
function stableEventUid(event: ParsedCalendarEvent): string {
  if (event.uid?.trim()) return event.uid.trim().slice(0, 500);
  return `~${event.startsAt}|${event.title}|${event.location ?? ""}`.slice(0, 500);
}

type AdminClient = ReturnType<typeof createAdminClient>;

async function recordFailure(
  supabase: AdminClient,
  schoolId: string,
  message: string
): Promise<SchoolCalendarSync> {
  await supabase
    .from("schools")
    .update({ calendar_last_error: message })
    .eq("id", schoolId);
  return { schoolId, count: 0, error: message };
}
