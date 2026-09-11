import "server-only";

import {
  CalendarError,
  normaliseCalendarUrl,
  readCalendarFeed,
  type ParsedCalendar,
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

/**
 * Fetches a school's feed and replaces its cached occurrences. Safe to call
 * as often as somebody presses Refresh: the cache is rebuilt from scratch
 * every time, so an event dropped from the feed disappears here too.
 *
 * A failure leaves the previous rows and the previous "last synced" alone and
 * records the reason on the school, so the page can say what happened without
 * pretending the calendar is empty.
 */
export async function syncSchoolCalendar(
  schoolId: string,
  now: Date = new Date()
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

  const { error: clearErr } = await supabase
    .from("school_calendar_events")
    .delete()
    .eq("school_id", schoolId);
  if (clearErr) {
    console.error("[school-calendar] clear failed", schoolId, clearErr);
    return recordFailure(supabase, schoolId, "We couldn’t save that calendar.");
  }

  if (parsed.events.length > 0) {
    const { error: insertErr } = await supabase
      .from("school_calendar_events")
      .insert(
        parsed.events.map((event) => ({
          school_id: schoolId,
          household_id: householdId,
          uid: event.uid,
          title: event.title,
          starts_at: event.startsAt,
          ends_at: event.endsAt,
          all_day: event.allDay,
          location: event.location,
        }))
      );
    if (insertErr) {
      console.error("[school-calendar] insert failed", schoolId, insertErr);
      return recordFailure(supabase, schoolId, "We couldn’t save that calendar.");
    }
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
