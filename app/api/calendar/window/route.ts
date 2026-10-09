import { NextResponse } from "next/server";
import { loadCalendarWindow } from "@/lib/calendar-load";
import { parseMonthKey } from "@/lib/calendar-month";
import { requireOnboarded } from "@/lib/household";

export const runtime = "nodejs";

/** Wide-window calendar data for client-side month navigation. */
export async function GET(request: Request) {
  const { supabase, household } = await requireOnboarded();
  const url = new URL(request.url);
  const anchor = parseMonthKey(url.searchParams.get("ym"));

  const payload = await loadCalendarWindow(supabase, household.id, anchor);
  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "private, no-store",
    },
  });
}
