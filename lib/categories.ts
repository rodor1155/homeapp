// The fixed filing categories, client-safe so the uploader and the property
// hub can share them with the server-only overview code.

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

export function isCategory(value: unknown): value is Category {
  return (CATEGORIES as readonly string[]).includes(value as string);
}

/** The stored value if it is one of ours, else null. */
export function asCategory(value: unknown): Category | null {
  return isCategory(value) ? value : null;
}

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

export type CategorisableDocument = {
  doc_type: string | null;
  provider: string | null;
};

/** Guesses from the free-text doc_type / provider. "Other" is the fallback. */
export function categorise(doc: CategorisableDocument): Category {
  const haystack = `${doc.doc_type ?? ""} ${doc.provider ?? ""}`;
  if (!haystack.trim()) return "Other";
  for (const [category, pattern] of CATEGORY_PATTERNS) {
    if (pattern.test(haystack)) return category;
  }
  return "Other";
}

/**
 * What a document actually files under: the category chosen at upload if there
 * is one, else the keyword guess (which is all a legacy row has).
 */
export function effectiveCategory(
  doc: CategorisableDocument & { category?: string | null }
): Category {
  return asCategory(doc.category) ?? categorise(doc);
}
