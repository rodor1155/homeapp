import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { syncSchoolCalendar } from "@/lib/school-calendar";
import { createAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";
// Feeds are fetched one at a time from other people's servers; Hobby caps at 60s.
export const maxDuration = 60;

// How many schools one run will take on. The rest keep the calendar they have
// and come round again tomorrow — a stale feed is a much smaller problem than a
// run that gets killed halfway through rebuilding a cache.
const MAX_SCHOOLS = 50;

// Stop starting new feeds once the run is this old, so the last one still has
// room for its 10s fetch inside maxDuration.
const DEADLINE_MS = 45_000;

function authorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;

  const provided =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    console.warn(
      "[school-calendars] cron skipped — CRON_SECRET is not set, so this run is ignored"
    );
    return NextResponse.json({
      skipped: true,
      reason: "CRON_SECRET not configured",
      processed: 0,
      synced: 0,
      errors: 0,
    });
  }

  if (!authorized(request)) {
    console.warn("[school-calendars] cron rejected — bearer token did not match");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const startedAt = Date.now();

  // Stalest first, so the ones the cap leaves behind are the ones that were
  // read most recently anyway. A school that has never synced sorts to the top.
  const { data, count, error } = await supabase
    .from("schools")
    .select("id", { count: "exact" })
    .not("calendar_url", "is", null)
    .neq("calendar_url", "")
    .order("calendar_last_synced_at", { ascending: true, nullsFirst: true })
    .limit(MAX_SCHOOLS);

  if (error) {
    console.error("[school-calendars] could not load the schools", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const schools = data ?? [];
  const summary = {
    processed: 0,
    synced: 0,
    errors: 0,
    // Over the cap, or left when the run ran out of time.
    skipped: Math.max((count ?? schools.length) - schools.length, 0),
    events: 0,
  };

  for (const school of schools) {
    if (Date.now() - startedAt > DEADLINE_MS) {
      summary.skipped += schools.length - summary.processed;
      console.warn(
        `[school-calendars] out of time — ${schools.length - summary.processed} left for tomorrow`
      );
      break;
    }

    summary.processed += 1;

    try {
      const result = await syncSchoolCalendar(school.id as string);
      if (result.error) {
        summary.errors += 1;
        console.error(`[school-calendars] ${school.id} — ${result.error}`);
      } else {
        summary.synced += 1;
        summary.events += result.count;
      }
    } catch (e) {
      // syncSchoolCalendar swallows its own failures, so this is the database
      // going away mid-run. One feed must not take the batch with it.
      summary.errors += 1;
      console.error(`[school-calendars] ${school.id} failed`, e);
    }
  }

  return NextResponse.json(summary);
}
