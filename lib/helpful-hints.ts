// The two or three things worth saying on the home screen this morning.
// Setup gaps only — a date that is nearly here is already in "Coming up", and
// saying it twice is noise. Pure shaping, so the caller does the reading.

import type { HouseholdPerson, School } from "@/lib/family";

/** Which soft icon a hint wears. Named, not imported, so this stays data. */
export type HintIcon = "people" | "school" | "calendar" | "basket" | "file";

export type HelpfulHint = {
  key: string;
  title: string;
  body: string;
  href: string;
  icon: HintIcon;
};

/** What the home screen already knows, reduced to what a hint turns on. */
export type HintFacts = {
  people: readonly HouseholdPerson[];
  schools: readonly School[];
  listCount: number;
  documentCount: number;
};

/** Three is a briefing. More is a chore list. */
export const MAX_HINTS = 3;

/**
 * The gaps, most-worth-filling first, capped at three. An empty array means
 * the household is set up — the section renders nothing at all.
 */
export function helpfulHints(facts: HintFacts): HelpfulHint[] {
  const { people, schools, listCount, documentCount } = facts;
  const hints: HelpfulHint[] = [];

  if (people.length === 0) {
    hints.push({
      key: "people",
      icon: "people",
      href: "/family",
      title: "Say who lives here",
      body: "Add the family and their birthdays come round on their own.",
    });
  } else {
    if (people.every((person) => !person.birthday)) {
      hints.push({
        key: "birthdays",
        icon: "calendar",
        href: "/family",
        title: "Add a birthday or two",
        body: "Nobody has one yet, so the calendar has none of yours on it.",
      });
    }

    const unplaced = people.filter(
      (person) => person.kind === "child" && !person.school_id
    );
    const firstUnplaced = unplaced[0];
    if (firstUnplaced) {
      hints.push({
        key: "school-link",
        icon: "school",
        href: "/family",
        title:
          unplaced.length === 1
            ? `Say where ${firstUnplaced.name} goes to school`
            : "Say where the children go to school",
        body: "A school carries its own term dates, so this is what puts them on the calendar.",
      });
    }
  }

  const withoutFeed = schools.filter((school) => !school.calendar_url);
  const firstWithoutFeed = withoutFeed[0];
  if (firstWithoutFeed) {
    hints.push({
      key: "school-calendar",
      icon: "calendar",
      href: "/family",
      title:
        withoutFeed.length === 1
          ? `Paste ${firstWithoutFeed.name}’s term dates`
          : "Paste the schools’ term dates",
      body: "Most schools publish a calendar link. Drop it in and the terms and inset days read themselves.",
    });
  }

  if (listCount === 0) {
    hints.push({
      key: "lists",
      icon: "basket",
      href: "/lists",
      title: "Start a shopping list",
      body: "Everyone here sees the same one, and can tick things off in the shop.",
    });
  }

  if (documentCount === 0) {
    hints.push({
      key: "documents",
      icon: "file",
      href: "/documents?upload=1#upload",
      title: "File your first document",
      body: "A photo of a policy or a bill is read and sorted for you, renewal date and all.",
    });
  }

  return hints.slice(0, MAX_HINTS);
}
