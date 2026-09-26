import Link from "next/link";
import { House } from "lucide-react";
import type { ReactNode } from "react";
import type { ComingUpEntry } from "@/lib/coming-up";
import type { HouseholdPerson } from "@/lib/family";
import type { Locale } from "@/lib/household";
import EveningCardStack from "./EveningCardStack";
import EveningMapBriefing from "./EveningMapBriefing";
import EveningMapGreeting from "./EveningMapGreeting";
import WhosWhereChips from "./WhosWhereChips";

export type EveningMapViewProps = {
  firstName: string;
  initials: string;
  entries: readonly ComingUpEntry[];
  people: readonly HouseholdPerson[];
  statuses: Record<string, string>;
  mapImagePathLight: string | null;
  mapImagePathDark: string | null;
  usesCarto: boolean;
  locale: Locale;
  loadFault: string | null;
  invites: ReactNode;
};

export default function EveningMapView({
  firstName,
  initials,
  entries,
  people,
  statuses,
  mapImagePathLight,
  mapImagePathDark,
  usesCarto,
  locale,
  loadFault,
  invites,
}: EveningMapViewProps) {
  return (
    <div className="evening-map-screen">
      <MapLayer
        mapImagePathLight={mapImagePathLight}
        mapImagePathDark={mapImagePathDark}
      />
      <div aria-hidden className="evening-map-scrim-top" />
      <div aria-hidden className="evening-map-scrim-bottom" />

      <div aria-hidden className="evening-map-pin">
        <span className="evening-map-pin-halo" />
        <span className="evening-map-pin-icon">
          <House size={22} strokeWidth={2.2} />
        </span>
      </div>

      {mapImagePathLight ? (
        <p className="evening-map-credit">
          © OpenStreetMap{usesCarto ? " · CARTO" : ""}
        </p>
      ) : null}

      <div className="evening-map-chrome">
        <header className="flex items-start justify-between gap-3 px-4 pb-2 pt-3">
          <div className="min-w-0 flex-1">
            <EveningMapGreeting firstName={firstName} />
            <EveningMapBriefing entries={entries} />
            <WhosWhereChips people={people} statuses={statuses} />
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

        <EveningCardStack entries={entries} people={people} locale={locale} />
      </div>
    </div>
  );
}

function MapLayer({
  mapImagePathLight,
  mapImagePathDark,
}: {
  mapImagePathLight: string | null;
  mapImagePathDark: string | null;
}) {
  if (!mapImagePathLight) {
    return <div aria-hidden className="evening-map-layer evening-map-fallback" />;
  }

  return (
    <div aria-hidden className="evening-map-layer">
      <picture>
        {mapImagePathDark ? (
          <source
            media="(prefers-color-scheme: dark)"
            srcSet={mapImagePathDark}
          />
        ) : null}
        <img src={mapImagePathLight} alt="" />
      </picture>
    </div>
  );
}
