import { Suspense } from "react";
import { displayName, type ShellUser } from "@/components/ShellGreeting";
import type { Locale } from "@/lib/household";
import { resolveHomeMap } from "@/lib/home-map";
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
  address,
}: {
  user: ShellUser;
  locale: Locale;
  householdId: string;
  address: string;
}) {
  const supabase = await createClient();
  const date = todayIso();
  const [comingUp, statusLoad, homeMap] = await Promise.all([
    loadComingUpData(supabase, householdId),
    loadPersonDayStatuses(supabase, householdId, date),
    resolveHomeMap(address),
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
      entries={comingUp.entries}
      people={comingUp.people}
      statuses={statuses}
      mapImagePath={homeMap?.imagePath ?? null}
      usesCarto={homeMap?.usesCarto ?? false}
      locale={locale}
      loadFault={comingUp.loadFault}
      invites={
        <Suspense fallback={null}>
          <InvitesBanner variant="evening" />
        </Suspense>
      }
    />
  );
}
