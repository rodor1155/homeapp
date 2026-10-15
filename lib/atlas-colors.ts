// Evening Atlas 2 — solid deck fills (client-safe).

import type { ComingUpKind } from "@/lib/coming-up";

/** Keys for `--atlas-fill-*` tokens in globals.css */
export type AtlasCardColor =
  | "navy"
  | "forest"
  | "maroon"
  | "plum"
  | "amber"
  | "teal"
  | "rose"
  | "slate";

export const ATLAS_COLOR_CLASS: Record<AtlasCardColor, string> = {
  navy: "atlas-fill-navy",
  forest: "atlas-fill-forest",
  maroon: "atlas-fill-maroon",
  plum: "atlas-fill-plum",
  amber: "atlas-fill-amber",
  teal: "atlas-fill-teal",
  rose: "atlas-fill-rose",
  slate: "atlas-fill-slate",
};

export function atlasColorForComingUpKind(kind: ComingUpKind): AtlasCardColor {
  switch (kind) {
    case "birthday":
      return "rose";
    case "school":
      return "forest";
    case "timetable":
      return "amber";
    case "routine":
      return "teal";
    case "shared":
      return "plum";
    case "event":
    default:
      return "navy";
  }
}
