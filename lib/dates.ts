// How a date is written on screen. Client-safe, and shared so the dashboard
// and the family panels never drift apart on it.

import type { Locale } from "@/lib/household";

export function intlLocale(locale: Locale): string {
  return locale === "US" ? "en-US" : "en-GB";
}

/** A stored YYYY-MM-DD as "3 Mar 2027". Falls back to the raw value. */
export function formatDate(iso: string, locale: Locale): string {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/** The same date said out loud: "tomorrow", "in 12 days", "in about 4 months". */
export function relativeWhen(daysAway: number): string {
  if (daysAway === 0) return "today";
  if (daysAway === 1) return "tomorrow";
  if (daysAway < 45) return `in ${daysAway} days`;
  const months = Math.round(daysAway / 30);
  return months < 12 ? `in about ${months} months` : "in over a year";
}
