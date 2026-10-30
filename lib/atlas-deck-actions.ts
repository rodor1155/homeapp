// Book / Open affordances for Atlas Home deck cards (client-safe).

import type { ComingUpEntry } from "@/lib/coming-up";

const MOT_BOOK_URL = "https://www.gov.uk/book-mot-test";

export type AtlasDeckActions = {
  bookLabel: string | null;
  bookUrl: string | null;
  openLabel: string;
};

function titleLooksLikeMot(title: string): boolean {
  return /\bmot\b/i.test(title);
}

function titleLooksLikeTax(title: string): boolean {
  if (/council/i.test(title)) return false;
  return /\b(car tax|vehicle tax|road tax|ved)\b/i.test(title);
}

/** External booking links only — nothing hits Rodor servers. */
export function atlasActionsForComingUp(entry: ComingUpEntry): AtlasDeckActions {
  if (entry.url?.trim()) {
    return {
      bookLabel: "Book",
      bookUrl: entry.url.trim(),
      openLabel: "Open record",
    };
  }

  if (titleLooksLikeMot(entry.title)) {
    return {
      bookLabel: "Book MOT",
      bookUrl: MOT_BOOK_URL,
      openLabel: "Open record",
    };
  }

  if (titleLooksLikeTax(entry.title)) {
    return {
      bookLabel: "Tax this vehicle",
      bookUrl: "https://www.gov.uk/vehicle-tax",
      openLabel: "Open record",
    };
  }

  return {
    bookLabel: null,
    bookUrl: null,
    openLabel: "Open record",
  };
}

export function atlasEyebrowForComingUp(entry: ComingUpEntry): string {
  const when =
    entry.overdue || entry.daysAway === 0
      ? "TODAY"
      : entry.daysAway === 1
        ? "TOMORROW"
        : entry.daysAway != null && entry.daysAway >= 0
          ? `IN ${entry.daysAway} DAYS`
          : entry.note.toUpperCase();
  return `${entry.note.toUpperCase()} · ${when}`;
}
