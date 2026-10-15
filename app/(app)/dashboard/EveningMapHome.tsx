import { Suspense } from "react";
import { displayName, type ShellUser } from "@/components/ShellGreeting";
import type { Locale } from "@/lib/household";
import { resolveHomeCoordinates } from "@/lib/home-map";
import { createClient } from "@/lib/supabase-server";
import { loadPersonDayStatuses, todayIso } from "@/lib/whos-where";
import { loadComingUpData } from "./coming-up-data";
import EveningMapView from "./EveningMapView";
import InvitesBanner from "./InvitesBanner";

function initials(name: string): string {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("");
  return letters.toUpperCase() || "?";
}

export default async function EveningMapHome({
  user,
  locale,
  householdId,
  householdName,
  address,
  openWeekSheet = false,
}: {
  user: ShellUser;
  locale: Locale;
  householdId: string;
  householdName: string;
  address: string;
  openWeekSheet?: boolean;
}) {
  const supabase = await createClient();
  const date = todayIso();
  const [comingUp, statusLoad, mapCenter] = await Promise.all([
    loadComingUpData(supabase, householdId, new Date(), locale),
    loadPersonDayStatuses(supabase, householdId, date),
    resolveHomeCoordinates(address),
  ]);

  const name = displayName(user);
  const firstName = name.split(/\s+/)[0] ?? name;

  const statuses = Object.fromEntries(
    statusLoad.items.map((s) => [s.person_id, s.status_text])
  );

  return (
    <EveningMapView
      firstName={firstName}
      initials={initials(name)}
      householdName={householdName}
      entries={comingUp.entries}
      people={comingUp.people}
      statuses={statuses}
      mapCenter={
        mapCenter
          ? { lat: mapCenter.latitude, lng: mapCenter.longitude }
          : null
      }
      locale={locale}
      loadFault={comingUp.loadFault}
      weekAhead={comingUp.weekAhead}
      openWeekSheet={openWeekSheet}
      invites={
        <Suspense fallback={null}>
          <InvitesBanner variant="evening" />
        </Suspense>
      }
    />
  );
}
