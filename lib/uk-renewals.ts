// Common UK household renewals — presets for the native vault (client-safe).

import type { AtlasCardColor } from "@/lib/atlas-colors";

export type UkRenewalPreset = {
  id: string;
  title: string;
  subtitle: string;
  color: AtlasCardColor;
  /** Default repeat interval in months, or null for one-off / user picks. */
  repeatMonths: number | null;
  /** Days before expiry to remind (e.g. insurance 28 and 7). */
  remindDaysBefore: number[];
};

export const UK_RENEWAL_PRESETS: UkRenewalPreset[] = [
  {
    id: "car-insurance",
    title: "Car insurance",
    subtitle: "Remind 28 + 7 days before",
    color: "forest",
    repeatMonths: 12,
    remindDaysBefore: [28, 7],
  },
  {
    id: "home-insurance",
    title: "Home insurance",
    subtitle: "Remind 28 + 7 days before",
    color: "navy",
    repeatMonths: 12,
    remindDaysBefore: [28, 7],
  },
  {
    id: "mot",
    title: "MOT",
    subtitle: "Yearly · 14 days before",
    color: "navy",
    repeatMonths: 12,
    remindDaysBefore: [14],
  },
  {
    id: "car-tax",
    title: "Car tax",
    subtitle: "Yearly · 14 days before",
    color: "slate",
    repeatMonths: 12,
    remindDaysBefore: [14],
  },
  {
    id: "boiler-service",
    title: "Boiler service",
    subtitle: "Yearly · 14 days before",
    color: "amber",
    repeatMonths: 12,
    remindDaysBefore: [14],
  },
  {
    id: "tv-licence",
    title: "TV licence",
    subtitle: "Yearly · 14 days before",
    color: "plum",
    repeatMonths: 12,
    remindDaysBefore: [14],
  },
  {
    id: "passport",
    title: "Passport",
    subtitle: "10 yrs · 6 months before",
    color: "maroon",
    repeatMonths: 120,
    remindDaysBefore: [180],
  },
  {
    id: "breakdown-cover",
    title: "Breakdown cover",
    subtitle: "Remind 28 + 7 days before",
    color: "teal",
    repeatMonths: 12,
    remindDaysBefore: [28, 7],
  },
  {
    id: "broadband",
    title: "Broadband deal",
    subtitle: "End date · 6 weeks before",
    color: "navy",
    repeatMonths: null,
    remindDaysBefore: [42],
  },
];

export function ukRenewalPreset(id: string): UkRenewalPreset | undefined {
  return UK_RENEWAL_PRESETS.find((p) => p.id === id);
}
