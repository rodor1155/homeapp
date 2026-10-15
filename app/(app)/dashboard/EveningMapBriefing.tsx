"use client";

import { useSyncExternalStore } from "react";
import type { ComingUpEntry } from "@/lib/coming-up";
import {
  atlasBriefingLine,
  atlasBriefingServerSnapshot,
} from "@/lib/evening-map";

function subscribe() {
  return () => {};
}

export default function EveningMapBriefing({
  householdName,
  entries,
}: {
  householdName: string;
  entries: readonly ComingUpEntry[];
}) {
  const line = useSyncExternalStore(
    subscribe,
    () => atlasBriefingLine(householdName, entries),
    () => atlasBriefingServerSnapshot(householdName, entries)
  );

  return (
    <p className="evening-greeting-sub atlas-briefing mt-1" suppressHydrationWarning>
      {line}
    </p>
  );
}
