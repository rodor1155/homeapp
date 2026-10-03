import "server-only";

import {
  buildHouseholdIcs,
  type IcsFeedInput,
  type IcsHouseholdEvent,
  type IcsPerson,
} from "@/lib/ics-export";
import { EVENT_TYPE_LABEL, type EventType } from "@/lib/family";
import { publicAppOrigin } from "@/lib/public-app-origin";
import { createAdminClient } from "@/lib/supabase-admin";

const EVENTS_SELECT =
  "id, title, event_date, event_type, notes, created_at";
const PEOPLE_SELECT = "id, name, birthday, created_at";

export async function buildIcsFeedForToken(
  householdId: string,
  householdName: string,
  generatedAt: Date = new Date()
): Promise<string> {
  const admin = createAdminClient();

  const [eventsRes, peopleRes] = await Promise.all([
    admin
      .from("household_events")
      .select(EVENTS_SELECT)
      .eq("household_id", householdId),
    admin
      .from("household_people")
      .select(PEOPLE_SELECT)
      .eq("household_id", householdId),
  ]);

  const input: IcsFeedInput = {
    householdName,
    appOrigin: publicAppOrigin(),
    generatedAt,
    events: (eventsRes.data ?? []) as IcsHouseholdEvent[],
    people: (peopleRes.data ?? []) as IcsPerson[],
    eventTypeLabels: EVENT_TYPE_LABEL as Record<EventType, string>,
  };

  return buildHouseholdIcs(input, generatedAt);
}
