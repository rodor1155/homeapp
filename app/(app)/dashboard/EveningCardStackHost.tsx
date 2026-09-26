"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { ComingUpEntry } from "@/lib/coming-up";
import type { PersonSortable } from "@/lib/evening-map";
import type { Locale } from "@/lib/household";
import type { WeekAheadModel } from "@/lib/week-ahead";
import EveningCardStack from "./EveningCardStack";

export default function EveningCardStackHost({
  entries,
  people,
  locale,
  weekAhead,
  initialWeekSheetOpen = false,
}: {
  entries: readonly ComingUpEntry[];
  people: readonly PersonSortable[];
  locale: Locale;
  weekAhead: WeekAheadModel | null;
  initialWeekSheetOpen?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const onWeekSheetClose = () => {
    if (!searchParams.get("week")) return;
    const next = new URLSearchParams(searchParams.toString());
    next.delete("week");
    const query = next.toString();
    router.replace(query ? `/dashboard?${query}` : "/dashboard");
  };

  return (
    <EveningCardStack
      entries={entries}
      people={people}
      locale={locale}
      weekAhead={weekAhead}
      initialWeekSheetOpen={initialWeekSheetOpen}
      onWeekSheetClose={onWeekSheetClose}
    />
  );
}
