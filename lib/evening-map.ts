// Evening map Home helpers — client-safe.

import type { ComingUpEntry } from "@/lib/coming-up";
import { formatDate, relativeWhen } from "@/lib/dates";
import type { Locale } from "@/lib/household";

/** Stable member edge colours (amber / dusty rose / sky). */
export const MEMBER_EDGE_CLASSES = [
  "evening-edge-amber",
  "evening-edge-rose",
  "evening-edge-sky",
] as const;

export type MemberEdgeClass = (typeof MEMBER_EDGE_CLASSES)[number] | "evening-edge-neutral";

export type PersonSortable = {
  id: string;
  sort_order: number;
};

/** Map a household person to a stable edge colour by sort order. */
export function memberEdgeClass(
  personId: string | null | undefined,
  people: readonly PersonSortable[]
): MemberEdgeClass {
  if (!personId) return "evening-edge-neutral";
  const sorted = [...people].sort(
    (a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id)
  );
  const idx = sorted.findIndex((p) => p.id === personId);
  if (idx < 0) return "evening-edge-neutral";
  return MEMBER_EDGE_CLASSES[idx % MEMBER_EDGE_CLASSES.length];
}

function todayEntryCount(entries: readonly ComingUpEntry[]): number {
  return entries.filter((e) => e.daysAway === 0 || e.overdue).length;
}

/** SSR snapshot — always "today", never "tonight" (hour is device-local). */
export function eveningBriefingServerSnapshot(
  entries: readonly ComingUpEntry[]
): string {
  const todayCount = todayEntryCount(entries);
  if (todayCount === 0) return "Nothing else today";
  return todayCount === 1 ? "1 thing today" : `${todayCount} things today`;
}

/** Subtitle under the greeting from real Coming up rows for today. */
export function eveningBriefingLine(
  entries: readonly ComingUpEntry[],
  now: Date = new Date()
): string {
  const todayCount = todayEntryCount(entries);
  if (todayCount === 0) return "Nothing else today";
  const period = now.getHours() >= 17 ? "tonight" : "today";
  return todayCount === 1 ? `1 thing ${period}` : `${todayCount} things ${period}`;
}

/** Cards for the stack: today first, else the next few upcoming items. */
export function eveningStackEntries(
  entries: readonly ComingUpEntry[],
  limit = 6
): ComingUpEntry[] {
  const today = entries.filter((e) => e.daysAway === 0 || e.overdue);
  if (today.length > 0) return today.slice(0, limit);
  return entries.slice(0, limit);
}

export function eveningCardWhen(
  entry: ComingUpEntry,
  locale: Locale
): string {
  if (entry.overdue) return "Overdue";
  if (entry.daysAway === 0) return "Today";
  if (entry.daysAway === 1) return "Tomorrow";
  return `${formatDate(entry.date, locale)} · ${relativeWhen(entry.daysAway)}`;
}
