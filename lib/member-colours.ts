// Household member colours — one palette, used for chips, deck edges, avatars
// and calendar dots. Client-safe.

import type { CSSProperties } from "react";

export const MEMBER_COLOUR_KEYS = [
  "amber",
  "rose",
  "sky",
  "sage",
  "lilac",
  "coral",
  "teal",
  "slate",
] as const;

export type MemberColourKey = (typeof MEMBER_COLOUR_KEYS)[number];

export const MEMBER_COLOUR_LABEL: Record<MemberColourKey, string> = {
  amber: "Amber",
  rose: "Rose",
  sky: "Sky",
  sage: "Sage",
  lilac: "Lilac",
  coral: "Coral",
  teal: "Teal",
  slate: "Slate",
};

export const MEMBER_COLOURS = MEMBER_COLOUR_KEYS.map((key) => ({
  key,
  label: MEMBER_COLOUR_LABEL[key],
  cssVar: `var(--member-${key})`,
  softVar: `var(--member-${key}-soft)`,
}));

export type PersonColourable = {
  id: string;
  sort_order: number;
  colour?: string | null;
};

export function isMemberColour(value: unknown): value is MemberColourKey {
  return (MEMBER_COLOUR_KEYS as readonly string[]).includes(value as string);
}

export function asMemberColour(value: unknown): MemberColourKey | null {
  return isMemberColour(value) ? value : null;
}

/** Stable household order — sort_order, then id. */
export function sortPeople<T extends PersonColourable>(
  people: readonly T[]
): T[] {
  return [...people].sort(
    (a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id)
  );
}

export function colourAtIndex(index: number): MemberColourKey {
  return MEMBER_COLOUR_KEYS[index % MEMBER_COLOUR_KEYS.length];
}

/** Stored colour, or the legacy sort-order slot when the column is still null. */
export function personColour(
  person: PersonColourable,
  people: readonly PersonColourable[]
): MemberColourKey {
  const stored = asMemberColour(person.colour);
  if (stored) return stored;
  const sorted = sortPeople(people);
  const idx = sorted.findIndex((p) => p.id === person.id);
  return colourAtIndex(idx >= 0 ? idx : 0);
}

export function personColourById(
  personId: string | null | undefined,
  people: readonly PersonColourable[]
): MemberColourKey | null {
  if (!personId) return null;
  const person = people.find((p) => p.id === personId);
  if (!person) return null;
  return personColour(person, people);
}

/** First palette colour not used in this household; cycles when all eight are taken. */
export function nextFreeColour(
  existing: readonly PersonColourable[]
): MemberColourKey {
  const used = new Set(
    existing
      .map((p) => asMemberColour(p.colour))
      .filter((c): c is MemberColourKey => c !== null)
  );
  for (const key of MEMBER_COLOUR_KEYS) {
    if (!used.has(key)) return key;
  }
  return colourAtIndex(existing.length);
}

export function memberColourVar(key: MemberColourKey): string {
  return `var(--member-${key})`;
}

export function memberColourSoftVar(key: MemberColourKey): string {
  return `var(--member-${key}-soft)`;
}

export type MemberEdgeClass =
  | `evening-edge-${MemberColourKey}`
  | "evening-edge-neutral";

/** CSS class for deck edges and Coming up rows — member colour or neutral. */
export function memberEdgeClass(
  personId: string | null | undefined,
  people: readonly PersonColourable[]
): MemberEdgeClass {
  const colour = personColourById(personId, people);
  if (!colour) return "evening-edge-neutral";
  return `evening-edge-${colour}`;
}

export function memberColourStyle(key: MemberColourKey): CSSProperties {
  return {
    "--member-dot": memberColourVar(key),
    "--member-avatar-bg": memberColourSoftVar(key),
    "--member-avatar-fg": memberColourVar(key),
  } as CSSProperties;
}
