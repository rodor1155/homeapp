"use client";

import { useSyncExternalStore } from "react";
import type { ComingUpEntry } from "@/lib/coming-up";
import {
  eveningBriefingLine,
  eveningBriefingServerSnapshot,
} from "@/lib/evening-map";

function subscribe() {
  return () => {};
}

export default function EveningMapBriefing({
  entries,
}: {
  entries: readonly ComingUpEntry[];
}) {
  const line = useSyncExternalStore(
    subscribe,
    () => eveningBriefingLine(entries),
    () => eveningBriefingServerSnapshot(entries)
  );

  return (
    <p className="evening-greeting-sub mt-1" suppressHydrationWarning>
      {line}
    </p>
  );
}
