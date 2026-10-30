import Link from "next/link";
import { House } from "lucide-react";
import { Suspense, type ReactNode } from "react";
import HearthMapController from "@/components/HearthMapController";
import type { ComingUpEntry } from "@/lib/coming-up";
import type { HouseholdPerson } from "@/lib/family";
import type { Locale } from "@/lib/household";
import EveningCardStackHost from "./EveningCardStackHost";
import type { WeekAheadModel } from "@/lib/week-ahead";
import EveningMapBriefing from "./EveningMapBriefing";
import EveningMapGreeting from "./EveningMapGreeting";
import WhosWhereChips from "./WhosWhereChips";
import { WHOS_WHERE_ENABLED } from "@/lib/whos-where";

export type EveningMapViewProps = {
  firstName: string;
  initials: string;
  householdName: string;
  entries: readonly ComingUpEntry[];
  people: readonly HouseholdPerson[];
  statuses: Record<string, string>;
  mapCenter: { lat: number; lng: number } | null;
  locale: Locale;
  loadFault: string | null;
  invites: ReactNode;
  weekAhead: WeekAheadModel | null;
  openWeekSheet?: boolean;
};

export default function EveningMapView({
  firstName,
  initials,
  householdName,
  entries,
  people,
  statuses,
  mapCenter,
  locale,
  loadFault,
  invites,
  weekAhead,
  openWeekSheet = false,
}: EveningMapViewProps) {
  return (
    <div className="evening-map-screen">
      <HearthMapController mapCenter={mapCenter} />
      <div aria-hidden className="evening-map-layer evening-map-fallback" />
      <div aria-hidden className="evening-map-scrim-top" />
      <div aria-hidden className="evening-map-scrim-bottom" />

      <div aria-hidden className="evening-map-pin">
        <span className="evening-map-pin-halo" />
        <span className="evening-map-pin-icon">
          <House size={22} strokeWidth={2.2} />
        </span>
      </div>

      <div className="evening-map-chrome">
        <header className="flex items-start justify-between gap-3 px-4 pb-2 pt-3">
          <div className="min-w-0 flex-1">
            <EveningMapGreeting firstName={firstName} />
            <EveningMapBriefing householdName={householdName} entries={entries} />
            {WHOS_WHERE_ENABLED ? (
              <WhosWhereChips people={people} statuses={statuses} />
            ) : null}
          </div>
          <Link
            href="/settings"
            aria-label="Settings"
            className="evening-avatar-link evening-glass shrink-0"
          >
            {initials}
          </Link>
        </header>

        <div className="px-4 pb-2">{invites}</div>

        {loadFault ? (
          <p role="status" className="px-4 text-sm text-member-rose">
            {loadFault}
          </p>
        ) : null}

        <Suspense fallback={null}>
          <EveningCardStackHost
            entries={entries}
            people={people}
            locale={locale}
            weekAhead={weekAhead}
            initialWeekSheetOpen={openWeekSheet}
          />
        </Suspense>
      </div>
    </div>
  );
}
