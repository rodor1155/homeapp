import "server-only";

import {
  buildHouseholdIcs,
  type IcsFeedInput,
  type IcsHouseholdEvent,
  type IcsPerson,
  type IcsRenewalItem,
} from "@/lib/ics-export";
import { EVENT_TYPE_LABEL, type EventType } from "@/lib/family";
import { publicAppOrigin } from "@/lib/public-app-origin";
import { RENEWAL_KIND_META, type RenewalKind } from "@/lib/renewals";
import { createAdminClient } from "@/lib/supabase-admin";

const EVENTS_SELECT =
  "id, title, event_date, event_type, notes, created_at";
const RENEWALS_SELECT =
  "id, person_id, title, kind, due_date, remind_days, reference, provider, notes, updated_at, created_at";
const PEOPLE_SELECT = "id, name, birthday, created_at";

export async function buildIcsFeedForToken(
  householdId: string,
  householdName: string,
  generatedAt: Date = new Date()
): Promise<string> {
  const admin = createAdminClient();

  const [eventsRes, renewalsRes, peopleRes] = await Promise.all([
    admin
      .from("household_events")
      .select(EVENTS_SELECT)
      .eq("household_id", householdId),
    admin
      .from("renewal_items")
      .select(RENEWALS_SELECT)
      .eq("household_id", householdId)
      .eq("status", "active")
      .not("due_date", "is", null),
    admin
      .from("household_people")
      .select(PEOPLE_SELECT)
      .eq("household_id", householdId),
  ]);

  const renewalKindLabels = Object.fromEntries(
    Object.entries(RENEWAL_KIND_META).map(([kind, meta]) => [kind, meta.label])
  ) as Record<RenewalKind, string>;

  const input: IcsFeedInput = {
    householdName,
    appOrigin: publicAppOrigin(),
    generatedAt,
    events: (eventsRes.data ?? []) as IcsHouseholdEvent[],
    renewals: (renewalsRes.data ?? []) as IcsRenewalItem[],
    people: (peopleRes.data ?? []) as IcsPerson[],
    eventTypeLabels: EVENT_TYPE_LABEL as Record<EventType, string>,
    renewalKindLabels,
  };

  return buildHouseholdIcs(input, generatedAt);
}
