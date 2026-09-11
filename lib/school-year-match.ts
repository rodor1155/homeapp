// Match school calendar titles to the years the household's children are in.
// Titles are the only signal — SchoolCalendarEvent has no categories column —
// so "Y7 PGL" keeps for Year 7, "Half Term" keeps for everyone, and "Y10 …"
// drops when nobody in the house is in Year 10.

import type { HouseholdPerson } from "@/lib/family";
import { SCHOOL_YEARS } from "@/lib/family";

const CANONICAL = new Set<string>(SCHOOL_YEARS);

/** Decode the handful of entities ICS titles sometimes carry. */
export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ");
}

function yearLabel(n: number): string | null {
  if (n < 1 || n > 13) return null;
  const label = `Year ${n}`;
  return CANONICAL.has(label) ? label : null;
}

/**
 * Canonical year groups mentioned in a title (`Year 7`, `Nursery`, …).
 * Returns an empty set when the title names none — that means whole-school.
 *
 * Assert-style examples (keep the helper pure; tsc covers the wiring):
 * - "Y7 PGL Trip"            → Year 7
 * - "Y 9 Parents' Evening"   → Year 9
 * - "Yr 10 &amp; 11 exams"   → Year 10, Year 11
 * - "Y12/13 Induction"       → Year 12, Year 13
 * - "Sixth Form Open Evening"→ Year 12, Year 13
 * - "Nursery stay & play"    → Nursery
 * - "Half Term" / "INSET Day"→ (empty → whole-school)
 */
export function yearsMentionedInTitle(title: string): Set<string> {
  const text = decodeHtmlEntities(title);
  const found = new Set<string>();

  if (/\bsixth\s*form\b/i.test(text)) {
    found.add("Year 12");
    found.add("Year 13");
  }
  if (/\bnursery\b/i.test(text)) found.add("Nursery");
  if (/\breception\b/i.test(text)) found.add("Reception");

  // Ranges first: Y12/13, Yr 7-9, Year 10 & 11, Years 7–8
  const range =
    /\b(?:years?|yrs?\.?|y)\s*(\d{1,2})\s*(?:[/–—-]|&)\s*(?:(?:years?|yrs?\.?|y)\s*)?(\d{1,2})\b/gi;
  let match: RegExpExecArray | null;
  while ((match = range.exec(text)) !== null) {
    const a = Number(match[1]);
    const b = Number(match[2]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    // Slash pairs like 12/13 are adjacent years; hyphen spans are inclusive.
    if (match[0].includes("/") || hi - lo <= 1) {
      const left = yearLabel(a);
      const right = yearLabel(b);
      if (left) found.add(left);
      if (right) found.add(right);
    } else {
      for (let n = lo; n <= hi; n += 1) {
        const label = yearLabel(n);
        if (label) found.add(label);
      }
    }
  }

  // Singles: Y7, Y 7, Yr. 7, Year 7 (skip digits already claimed by a range
  // by matching the same prefixes; duplicates in the set are fine).
  const single = /\b(?:year|yr\.?|y)\s*(\d{1,2})\b/gi;
  while ((match = single.exec(text)) !== null) {
    const label = yearLabel(Number(match[1]));
    if (label) found.add(label);
  }

  return found;
}

/**
 * Keep when the title is whole-school, or when it names at least one of the
 * children's years. An empty childYears set means "no year_group set yet" —
 * show everything rather than emptying the calendar.
 */
export function eventRelevantToYears(
  title: string,
  childYears: ReadonlySet<string>
): boolean {
  if (childYears.size === 0) return true;
  const mentioned = yearsMentionedInTitle(title);
  if (mentioned.size === 0) return true;
  for (const year of mentioned) {
    if (childYears.has(year)) return true;
  }
  return false;
}

/** Every non-empty year_group on the household's children. */
export function householdChildYears(
  people: readonly HouseholdPerson[]
): Set<string> {
  const years = new Set<string>();
  for (const person of people) {
    if (person.kind !== "child") continue;
    const year = person.year_group?.trim();
    if (year) years.add(year);
  }
  return years;
}

/**
 * Years to filter a school's feed with: children linked to that school first;
 * if none are linked, fall back to every household child year so a feed isn't
 * blanked by accident.
 */
export function childYearsForSchool(
  people: readonly HouseholdPerson[],
  schoolId: string
): Set<string> {
  const linked = new Set<string>();
  for (const person of people) {
    if (person.kind !== "child" || person.school_id !== schoolId) continue;
    const year = person.year_group?.trim();
    if (year) linked.add(year);
  }
  if (linked.size > 0) return linked;
  return householdChildYears(people);
}
