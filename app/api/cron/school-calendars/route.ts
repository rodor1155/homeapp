import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { syncHouseholdCalendar } from "@/lib/household-calendar";
import { syncSchoolCalendar } from "@/lib/school-calendar";
import { createAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";
// Feeds are fetched one at a time from other people's servers; Hobby caps at 60s.
export const maxDuration = 60;

const MAX_SCHOOLS = 50;
const MAX_HOUSEHOLD_CALENDARS = 50;
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
      "[calendars] cron skipped — CRON_SECRET is not set, so this run is ignored"
    );
    return NextResponse.json({
      skipped: true,
      reason: "CRON_SECRET not configured",
      schools: { processed: 0, synced: 0, errors: 0 },
      household: { processed: 0, synced: 0, errors: 0 },
    });
  }

  if (!authorized(request)) {
    console.warn("[calendars] cron rejected — bearer token did not match");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const startedAt = Date.now();

  const schoolsSummary = {
    processed: 0,
    synced: 0,
    errors: 0,
    skipped: 0,
    events: 0,
  };

  const { data: schoolRows, count: schoolCount, error: schoolErr } =
    await supabase
      .from("schools")
      .select("id", { count: "exact" })
      .not("calendar_url", "is", null)
      .neq("calendar_url", "")
      .order("calendar_last_synced_at", { ascending: true, nullsFirst: true })
      .limit(MAX_SCHOOLS);

  if (schoolErr) {
    console.error("[calendars] could not load schools", schoolErr);
    return NextResponse.json({ error: schoolErr.message }, { status: 500 });
  }

  const schools = schoolRows ?? [];
  schoolsSummary.skipped = Math.max((schoolCount ?? schools.length) - schools.length, 0);

  for (const school of schools) {
    if (Date.now() - startedAt > DEADLINE_MS) {
      schoolsSummary.skipped += schools.length - schoolsSummary.processed;
      console.warn(
        `[calendars] out of time on schools — ${schools.length - schoolsSummary.processed} left`
      );
      break;
    }
    schoolsSummary.processed += 1;
    try {
      const result = await syncSchoolCalendar(school.id as string);
      if (result.error) {
        schoolsSummary.errors += 1;
        console.error(`[calendars] school ${school.id} — ${result.error}`);
      } else {
        schoolsSummary.synced += 1;
        schoolsSummary.events += result.count;
      }
    } catch (e) {
      schoolsSummary.errors += 1;
      console.error(`[calendars] school ${school.id} failed`, e);
    }
  }

  const householdSummary = {
    processed: 0,
    synced: 0,
    errors: 0,
    skipped: 0,
    events: 0,
  };

  const { data: calRows, count: calCount, error: calErr } = await supabase
    .from("household_calendars")
    .select("id", { count: "exact" })
    .not("calendar_url", "is", null)
    .neq("calendar_url", "")
    .order("calendar_last_synced_at", { ascending: true, nullsFirst: true })
    .limit(MAX_HOUSEHOLD_CALENDARS);

  if (calErr) {
    console.error("[calendars] could not load household calendars", calErr);
    // Schools already ran — return partial success with the household error noted.
    return NextResponse.json({
      schools: schoolsSummary,
      household: { error: calErr.message },
    });
  }

  const calendars = calRows ?? [];
  householdSummary.skipped = Math.max(
    (calCount ?? calendars.length) - calendars.length,
    0
  );

  for (const calendar of calendars) {
    if (Date.now() - startedAt > DEADLINE_MS) {
      householdSummary.skipped += calendars.length - householdSummary.processed;
      console.warn(
        `[calendars] out of time on household feeds — ${calendars.length - householdSummary.processed} left`
      );
      break;
    }
    householdSummary.processed += 1;
    try {
      const result = await syncHouseholdCalendar(calendar.id as string);
      if (result.error) {
        householdSummary.errors += 1;
        console.error(`[calendars] household ${calendar.id} — ${result.error}`);
      } else {
        householdSummary.synced += 1;
        householdSummary.events += result.count;
      }
    } catch (e) {
      householdSummary.errors += 1;
      console.error(`[calendars] household ${calendar.id} failed`, e);
    }
  }

  return NextResponse.json({
    schools: schoolsSummary,
    household: householdSummary,
  });
}
