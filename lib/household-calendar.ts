import "server-only";

import {
  CalendarError,
  normaliseCalendarUrl,
  readCalendarFeed,
  type ParsedCalendar,
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

/**
 * Fetches one of the household's feeds and replaces its cached occurrences.
 * Safe to call as often as somebody presses Refresh: the cache is rebuilt
 * from scratch every time, so an event dropped from the feed disappears here
 * too, and clearing the link is what empties it.
 *
 * A failure leaves the previous rows and the previous "last read" alone and
 * records the reason on the calendar, so /calendar can say what happened
 * instead of pretending the feed is empty.
 */
export async function syncHouseholdCalendar(
  calendarId: string,
  now: Date = new Date()
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

  const { error: clearErr } = await supabase
    .from("household_calendar_events")
    .delete()
    .eq("calendar_id", calendarId);
  if (clearErr) {
    console.error("[household-calendar] clear failed", calendarId, clearErr);
    return recordFailure(supabase, calendarId, "We couldn’t save that calendar.");
  }

  if (parsed.events.length > 0) {
    const { error: insertErr } = await supabase
      .from("household_calendar_events")
      .insert(
        parsed.events.map((event) => ({
          calendar_id: calendarId,
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
      console.error("[household-calendar] insert failed", calendarId, insertErr);
      return recordFailure(supabase, calendarId, "We couldn’t save that calendar.");
    }
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
