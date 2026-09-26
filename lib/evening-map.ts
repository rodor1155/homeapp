// Evening map Home helpers — client-safe.

import { COMING_UP_TONE, type ComingUpEntry } from "@/lib/coming-up";
import { formatDate, relativeWhen } from "@/lib/dates";
import type { Locale } from "@/lib/household";
import {
  memberColourVar,
  memberEdgeClass,
  personColourById,
  type MemberEdgeClass,
  type PersonColourable,
} from "@/lib/member-colours";
import type { Tone } from "@/lib/tones";

export type { MemberEdgeClass, PersonColourable as PersonSortable };
export { memberEdgeClass };

const TONE_HUE_TINT: Record<Tone, string> = {
  sage: "var(--hue-sage)",
  ochre: "var(--hue-ochre)",
  navy: "var(--hue-navy)",
  lilac: "var(--hue-lilac)",
  peach: "var(--hue-peach)",
  sky: "var(--hue-sky)",
};

/** CSS colour for `--card-tint` on peeking deck cards. */
export function cardTintForEntry(
  entry: ComingUpEntry,
  people: readonly PersonColourable[]
): string {
  const colour = personColourById(entry.personId, people);
  if (colour) return memberColourVar(colour);
  return TONE_HUE_TINT[COMING_UP_TONE[entry.kind]];
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
