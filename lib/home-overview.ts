import "server-only";

import type { DocumentRow } from "@/lib/document-types";

/* Pure shaping of a household's extracted documents for the home overview.
   No I/O — the caller loads the rows and passes them in. */

/** Only rows that have been through extraction carry usable fields. */
export const OVERVIEW_STATUSES = [
  "extracted",
  "needs_review",
  "confirmed",
] as const;

export const CATEGORIES = [
  "Insurance",
  "Utilities & bills",
  "Vehicle",
  "Property & compliance",
  "Warranties & appliances",
  "Subscriptions & services",
  "Other",
] as const;

export type Category = (typeof CATEGORIES)[number];

/** The subset of a document row the overview reads. */
export type OverviewDocument = Pick<
  DocumentRow,
  | "id"
  | "original_filename"
  | "extraction_status"
  | "doc_type"
  | "provider"
  | "end_date"
  | "renewal_date"
  | "amount"
  | "currency"
  | "key_contact_name"
  | "key_contact_phone"
>;

// First match wins, so the order here is the order of CATEGORIES: a car
// insurance policy files under Insurance, a boiler warranty under Warranties.
const CATEGORY_PATTERNS: ReadonlyArray<readonly [Category, RegExp]> = [
  [
    "Insurance",
    /\b(insur|assurance|underwrit|indemnit|policy|policies|cover note|no claims|excess)/i,
  ],
  [
    "Utilities & bills",
    /\b(utility|utilities|bill|energy|electric|gas suppl|water|sewerage|broadband|internet|telecom|mobile|landline|tariff|meter reading|council tax|standing charge)/i,
  ],
  [
    "Vehicle",
    /\b(vehicle|car\b|motor|mot\b|dvla|v5c|road tax|breakdown|tyre|van\b|driving licen)/i,
  ],
  [
    "Property & compliance",
    /\b(propert|mortgage|tenanc|lease|leasehold|freehold|deed|title|land registry|epc\b|energy performance|eicr\b|gas safe|safety certificate|survey|planning|building regulation|asbestos|compliance|inspection)/i,
  ],
  [
    "Warranties & appliances",
    /\b(warrant|guarantee|appliance|boiler|furnace|oven|fridge|freezer|washing machine|dishwasher|manual|receipt|service plan|extended cover|repair|installation)/i,
  ],
  [
    "Subscriptions & services",
    /\b(subscription|membership|service agreement|maintenance|streaming|cleaning|garden|alarm|monitoring|contract)/i,
  ],
];

/** Maps the free-text doc_type / provider onto a fixed set. "Other" is the fallback. */
export function categorise(
  doc: Pick<OverviewDocument, "doc_type" | "provider">
): Category {
  const haystack = `${doc.doc_type ?? ""} ${doc.provider ?? ""}`;
  if (!haystack.trim()) return "Other";
  for (const [category, pattern] of CATEGORY_PATTERNS) {
    if (pattern.test(haystack)) return category;
  }
  return "Other";
}

export type CategoryGroup = { category: Category; documents: OverviewDocument[] };

/** Groups documents by category, in CATEGORIES order, dropping empty categories. */
export function groupByCategory(
  docs: readonly OverviewDocument[]
): CategoryGroup[] {
  const groups = new Map<Category, OverviewDocument[]>();
  for (const doc of docs) {
    const category = categorise(doc);
    const bucket = groups.get(category);
    if (bucket) bucket.push(doc);
    else groups.set(category, [doc]);
  }
  return CATEGORIES.filter((c) => groups.has(c)).map((category) => ({
    category,
    documents: groups.get(category) ?? [],
  }));
}

// --- dates ---------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

/** Parses a stored YYYY-MM-DD value as UTC midnight. Null if unusable. */
function parseIsoDate(value: string | null): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return null;
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfUtcDay(now: Date): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

export type UpcomingDate = {
  provider: string;
  label: string;
  date: string;
  daysAway: number;
};

const DATE_COLUMNS = [
  ["renewal_date", "Renews"],
  ["end_date", "Ends"],
] as const;

/** Every renewal / end date still ahead of `now`, soonest first. */
export function upcomingDates(
  docs: readonly OverviewDocument[],
  now: Date = new Date()
): UpcomingDate[] {
  const today = startOfUtcDay(now);
  const entries: UpcomingDate[] = [];

  for (const doc of docs) {
    for (const [column, label] of DATE_COLUMNS) {
      const parsed = parseIsoDate(doc[column]);
      if (!parsed) continue;
      const daysAway = Math.round((parsed.getTime() - today) / DAY_MS);
      if (daysAway < 0) continue;
      entries.push({
        provider: documentLabel(doc),
        label,
        date: parsed.toISOString().slice(0, 10),
        daysAway,
      });
    }
  }

  return entries.sort(
    (a, b) => a.date.localeCompare(b.date) || a.provider.localeCompare(b.provider)
  );
}

/** Whichever date the overview should show for a document: renewal, else end. */
export function nextDate(doc: OverviewDocument): string | null {
  const renewal = parseIsoDate(doc.renewal_date);
  const end = parseIsoDate(doc.end_date);
  const chosen = renewal ?? end;
  return chosen ? chosen.toISOString().slice(0, 10) : null;
}

// --- money ---------------------------------------------------------------

/** `amount` arrives as a numeric string from PostgREST. */
export function parseAmount(value: number | string | null): number | null {
  if (value === null) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function normaliseCurrency(value: string | null): string | null {
  if (!value) return null;
  const code = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

export type CurrencyTotal = {
  currency: string;
  total: number;
  documents: number;
};

/** Sums `amount` per currency. Rows without both an amount and a currency are skipped. */
export function spendByCurrency(
  docs: readonly OverviewDocument[]
): CurrencyTotal[] {
  const totals = new Map<string, CurrencyTotal>();

  for (const doc of docs) {
    const amount = parseAmount(doc.amount);
    const currency = normaliseCurrency(doc.currency);
    if (amount === null || !currency) continue;

    const row = totals.get(currency) ?? { currency, total: 0, documents: 0 };
    row.total += amount;
    row.documents += 1;
    totals.set(currency, row);
  }

  return [...totals.values()]
    .map((row) => ({ ...row, total: Math.round(row.total * 100) / 100 }))
    .sort((a, b) => b.total - a.total || a.currency.localeCompare(b.currency));
}

// --- contacts ------------------------------------------------------------

export type Contact = {
  name: string | null;
  phone: string | null;
  sourceDocument: string;
};

function clean(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** How a document is named in a list: provider, else its type, else the filename. */
export function documentLabel(doc: OverviewDocument): string {
  return (
    clean(doc.provider) ?? clean(doc.doc_type) ?? doc.original_filename
  );
}

/** Deduped contacts across the file. Rows with neither a name nor a phone are skipped. */
export function contacts(docs: readonly OverviewDocument[]): Contact[] {
  const seen = new Map<string, Contact>();

  for (const doc of docs) {
    const name = clean(doc.key_contact_name);
    const phone = clean(doc.key_contact_phone);
    if (!name && !phone) continue;

    const key = `${name?.toLowerCase() ?? ""}|${
      phone?.replace(/[^\d+]/g, "") ?? ""
    }`;
    if (seen.has(key)) continue;

    seen.set(key, { name, phone, sourceDocument: documentLabel(doc) });
  }

  return [...seen.values()];
}
