import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { syncHouseholdCalendar } from "@/lib/household-calendar";
import { syncSchoolCalendar } from "@/lib/school-calendar";
import { createAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";
// Feeds are fetched one at a time from other people's servers; Hobby caps at 60s.
export const maxDuration = 60;

/** Small batches so one slow feed can't starve the other half under maxDuration. */
const MAX_SCHOOLS = 20;
const MAX_HOUSEHOLD_CALENDARS = 20;
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

type WorkItem =
  | { kind: "school"; id: string }
  | { kind: "household"; id: string };

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    console.warn(
      "[calendars] cron skipped — CRON_SECRET is not set, so this run is ignored"
    );
    return NextResponse.json({
      skipped: true,
      reason: "CRON_SECRET not configured",
      schools: { processed: 0, synced: 0, errors: 0, skipped: 0 },
      household: { processed: 0, synced: 0, errors: 0, skipped: 0 },
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
    eligible: 0,
  };

  const householdSummary = {
    processed: 0,
    synced: 0,
    errors: 0,
    skipped: 0,
    events: 0,
    eligible: 0,
  };

  const { data: schoolRows, count: schoolCount, error: schoolErr } =
    await supabase
      .from("schools")
      .select("id", { count: "exact" })
      .not("calendar_url", "is", null)
      .neq("calendar_url", "")
      .order("calendar_last_synced_at", { ascending: true, nullsFirst: true })
      .order("id", { ascending: true })
      .limit(MAX_SCHOOLS);

  if (schoolErr) {
    console.error("[calendars] could not load schools", schoolErr);
    return NextResponse.json({ error: schoolErr.message }, { status: 500 });
  }

  const { data: calRows, count: calCount, error: calErr } = await supabase
    .from("household_calendars")
    .select("id", { count: "exact" })
    .not("calendar_url", "is", null)
    .neq("calendar_url", "")
    .order("calendar_last_synced_at", { ascending: true, nullsFirst: true })
    .order("id", { ascending: true })
    .limit(MAX_HOUSEHOLD_CALENDARS);

  if (calErr) {
    console.error("[calendars] could not load household calendars", calErr);
    return NextResponse.json({ error: calErr.message }, { status: 500 });
  }

  const schools = schoolRows ?? [];
  const calendars = calRows ?? [];
  schoolsSummary.eligible = schoolCount ?? schools.length;
  householdSummary.eligible = calCount ?? calendars.length;
  // Not selected this run (beyond the batch) — oldest-first fairness means
  // they get another chance tomorrow / on the next cursor page.
  schoolsSummary.skipped = Math.max(
    (schoolCount ?? schools.length) - schools.length,
    0
  );
  householdSummary.skipped = Math.max(
    (calCount ?? calendars.length) - calendars.length,
    0
  );

  // Interleave so schools can't eat the whole deadline before household feeds.
  const queue: WorkItem[] = [];
  const sIds = schools.map((row) => row.id as string);
  const hIds = calendars.map((row) => row.id as string);
  const n = Math.max(sIds.length, hIds.length);
  for (let i = 0; i < n; i += 1) {
    if (i < sIds.length) queue.push({ kind: "school", id: sIds[i]! });
    if (i < hIds.length) queue.push({ kind: "household", id: hIds[i]! });
  }

  let stoppedEarly = false;
  for (const item of queue) {
    if (Date.now() - startedAt > DEADLINE_MS) {
      stoppedEarly = true;
      break;
    }

    if (item.kind === "school") {
      schoolsSummary.processed += 1;
      try {
        const result = await syncSchoolCalendar(item.id);
        if (result.error) {
          schoolsSummary.errors += 1;
          console.error(`[calendars] school ${item.id} — ${result.error}`);
        } else {
          schoolsSummary.synced += 1;
          schoolsSummary.events += result.count;
        }
      } catch (e) {
        schoolsSummary.errors += 1;
        console.error(`[calendars] school ${item.id} failed`, e);
      }
    } else {
      householdSummary.processed += 1;
      try {
        const result = await syncHouseholdCalendar(item.id);
        if (result.error) {
          householdSummary.errors += 1;
          console.error(`[calendars] household ${item.id} — ${result.error}`);
        } else {
          householdSummary.synced += 1;
          householdSummary.events += result.count;
        }
      } catch (e) {
        householdSummary.errors += 1;
        console.error(`[calendars] household ${item.id} failed`, e);
      }
    }
  }

  if (stoppedEarly) {
    const schoolsLeft = sIds.length - schoolsSummary.processed;
    const householdLeft = hIds.length - householdSummary.processed;
    if (schoolsLeft > 0) schoolsSummary.skipped += schoolsLeft;
    if (householdLeft > 0) householdSummary.skipped += householdLeft;
    console.warn(
      `[calendars] out of time — skipped ${schoolsLeft} schools, ${householdLeft} household feeds in this batch`
    );
  }

  const lastSchool = sIds[sIds.length - 1] ?? null;
  const lastHousehold = hIds[hIds.length - 1] ?? null;

  return NextResponse.json({
    schools: schoolsSummary,
    household: householdSummary,
    // Oldest-first + small batches: skipped feeds stay stale and win the next run.
    batch: {
      last_school: lastSchool,
      last_household: lastHousehold,
      stopped_early: stoppedEarly,
    },
  });
}
