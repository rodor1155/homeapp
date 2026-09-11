// Which colour a *kind* of thing wears. Client-safe and deliberately the only
// place a kind becomes a class name, so the calendar's dots, the dashboard's
// icon pills, the house file's drawers and the home screen's hints can't drift
// apart on what lilac means.
//
// A tone is never a status. "Filed", "needs a look" and "couldn't read it"
// stay on sage / ochre / oxblood through `mark-*` and `STATUS_META`; these
// only tell one sort of date or drawer from another.
//
// The literal strings matter: Tailwind v4 reads the class names straight out
// of the source, so they have to be written out here rather than assembled.

export type Tone = "sage" | "lilac" | "peach" | "sky" | "navy" | "ochre";

/** A 6px dot — a day in the month grid, a legend entry. */
export const TONE_DOT: Record<Tone, string> = {
  sage: "bg-sage-soft",
  lilac: "bg-lilac-soft",
  peach: "bg-peach-soft",
  sky: "bg-sky-soft",
  navy: "bg-navy",
  ochre: "bg-ochre",
};

/** The round icon plate in front of a row. */
export const TONE_PILL: Record<Tone, string> = {
  sage: "bg-sage-tint text-sage",
  lilac: "bg-lilac-tint text-lilac",
  peach: "bg-peach-tint text-peach",
  sky: "bg-sky-tint text-sky",
  navy: "bg-navy-tint text-ink",
  ochre: "bg-ochre-tint text-ochre",
};

/** A whole row's background, for the rows that get one. */
export const TONE_WASH: Record<Tone, string> = {
  sage: "bg-sage-wash",
  lilac: "bg-lilac-wash",
  peach: "bg-peach-wash",
  sky: "bg-sky-wash",
  navy: "bg-navy-wash",
  ochre: "bg-ochre-wash",
};

/** The same row, once you reach for it. Pairs with TONE_WASH. */
export const TONE_WASH_HOVER: Record<Tone, string> = {
  sage: "hover:bg-sage-tint",
  lilac: "hover:bg-lilac-tint",
  peach: "hover:bg-peach-tint",
  sky: "hover:bg-sky-tint",
  navy: "hover:bg-navy-tint",
  ochre: "hover:bg-ochre-tint",
};
