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

/** A date with its weekday, the way a briefing opens: "Fri, 11 September". */
export function formatWeekdayDate(iso: string, locale: Locale): string {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(intlLocale(locale), {
    weekday: "short",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(date);
}

/** A "YYYY-MM" key as the heading over a month: "October 2026". */
export function formatMonth(key: string, locale: Locale): string {
  const date = new Date(`${key}-01T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return key;
  return new Intl.DateTimeFormat(intlLocale(locale), {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/** Which day the week starts on here: Sunday in the US, Monday everywhere else. */
export function weekStartsOn(locale: Locale): 0 | 1 {
  return locale === "US" ? 0 : 1;
}

/** The row of names over a calendar grid, from the household's first day. */
export function weekdayLabels(locale: Locale): string[] {
  const format = new Intl.DateTimeFormat(intlLocale(locale), {
    weekday: "short",
    timeZone: "UTC",
  });
  // 7 January 2024 was a Sunday, so counting on from it names the week.
  const first = weekStartsOn(locale);
  return Array.from({ length: 7 }, (_, day) =>
    format.format(new Date(Date.UTC(2024, 0, 7 + first + day)))
  );
}

/** The same date said out loud: "tomorrow", "in 12 days", "in about 4 months". */
export function relativeWhen(daysAway: number): string {
  if (daysAway === 0) return "today";
  if (daysAway === 1) return "tomorrow";
  if (daysAway < 45) return `in ${daysAway} days`;
  const months = Math.round(daysAway / 30);
  return months < 12 ? `in about ${months} months` : "in over a year";
}
