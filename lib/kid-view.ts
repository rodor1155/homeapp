// Kid view — client-safe types, token shape and demo payload for dev previews.

import type { MemberColourKey } from "@/lib/member-colours";

/** 256-bit token → base64url without padding (same shape as the ICS feed). */
export const KID_VIEW_TOKEN_LENGTH = 43;

export function isValidKidViewToken(token: string): boolean {
  return (
    token.length === KID_VIEW_TOKEN_LENGTH && /^[A-Za-z0-9_-]+$/.test(token)
  );
}

export type KidViewItemKind =
  | "timetable"
  | "kit"
  | "ingredients"
  | "event"
  | "school"
  | "birthday";

export type KidViewItem = {
  kind: KidViewItemKind;
  title: string;
  subtitle: string | null;
  /** Minutes since midnight for ordering; lower sorts earlier. */
  sortMinutes: number;
};

export type KidViewDay = {
  date: string;
  label: string;
  isToday: boolean;
  whosWhere: string | null;
  items: KidViewItem[];
};

export type KidViewPayload = {
  firstName: string;
  colour: MemberColourKey;
  /** Present when the birthday is within 14 London days. */
  birthdayCountdown: { sleeps: number; date: string } | null;
  todayLabel: string;
  days: KidViewDay[];
};

export function kidViewIcon(kind: KidViewItemKind): string {
  switch (kind) {
    case "timetable":
      return "📚";
    case "kit":
      return "🎒";
    case "ingredients":
      return "🥕";
    case "event":
      return "📅";
    case "school":
      return "🏫";
    case "birthday":
      return "🎂";
    default:
      return "✨";
  }
}

export const DEMO_KID_VIEW: KidViewPayload = {
  firstName: "Sophie",
  colour: "sky",
  birthdayCountdown: { sleeps: 3, date: "2026-09-29" },
  todayLabel: "Saturday 26 September",
  days: [
    {
      date: "2026-09-26",
      label: "Today",
      isToday: true,
      whosWhere: "At swimming",
      items: [
        {
          kind: "kit",
          title: "PE kit",
          subtitle: "Before school",
          sortMinutes: 480,
        },
        {
          kind: "timetable",
          title: "Maths",
          subtitle: "Period 1 · Room 12",
          sortMinutes: 540,
        },
        {
          kind: "timetable",
          title: "Swimming",
          subtitle: "Period 4 · Sports centre",
          sortMinutes: 780,
        },
        {
          kind: "school",
          title: "Parents' evening",
          subtitle: "All day",
          sortMinutes: 900,
        },
      ],
    },
    {
      date: "2026-09-27",
      label: "Tomorrow",
      isToday: false,
      whosWhere: null,
      items: [],
    },
    {
      date: "2026-09-28",
      label: "Monday 28 Sep",
      isToday: false,
      whosWhere: null,
      items: [
        {
          kind: "ingredients",
          title: "Ingredients for Food Tech",
          subtitle: "Monday morning",
          sortMinutes: 480,
        },
        {
          kind: "timetable",
          title: "Food Tech",
          subtitle: "Period 2",
          sortMinutes: 600,
        },
      ],
    },
  ],
};
