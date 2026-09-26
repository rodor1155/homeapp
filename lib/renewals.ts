// Renewals & deadlines — client-safe types, pure helpers and loaders.

import type { SupabaseClient } from "@supabase/supabase-js";
import { daysUntil, parseDateParts, type FamilyList, type HouseholdPerson, type PersonKind } from "@/lib/family";
import { effectiveCategory, type Category } from "@/lib/categories";
import type { DocumentRow } from "@/lib/document-types";

// --- kinds -----------------------------------------------------------------

export const RENEWAL_KINDS = [
  "passport",
  "driving_licence",
  "ghic",
  "car_mot",
  "car_tax",
  "car_insurance",
  "home_insurance",
  "boiler_service",
  "tv_licence",
  "other",
] as const;

export type RenewalKind = (typeof RENEWAL_KINDS)[number];

export type RenewalScope = "person" | "house";

export type RepeatUnit = "none" | "month" | "year";

export type RenewalSource = "manual" | "suggestion" | "document";

export type RenewalStatus = "active" | "done" | "dismissed";

/** Lucide icon names — mapped to components in the UI layer. */
export type RenewalIconName =
  | "id-card"
  | "car"
  | "heart-pulse"
  | "wrench"
  | "receipt"
  | "shield"
  | "home"
  | "flame"
  | "tv"
  | "file-question";

export type RenewalKindMeta = {
  label: string;
  icon: RenewalIconName;
  scope: RenewalScope;
  /** Which person kinds get this as a suggestion chip. Empty = house-only. */
  personKinds: readonly PersonKind[];
  defaultRemindDays: number;
};

export const RENEWAL_KIND_META: Record<RenewalKind, RenewalKindMeta> = {
  passport: {
    label: "Passport",
    icon: "id-card",
    scope: "person",
    personKinds: ["adult", "child"],
    defaultRemindDays: 30,
  },
  driving_licence: {
    label: "Driving licence",
    icon: "car",
    scope: "person",
    personKinds: ["adult"],
    defaultRemindDays: 30,
  },
  ghic: {
    label: "GHIC",
    icon: "heart-pulse",
    scope: "person",
    personKinds: ["adult"],
    defaultRemindDays: 30,
  },
  car_mot: {
    label: "Car MOT",
    icon: "wrench",
    scope: "house",
    personKinds: [],
    defaultRemindDays: 14,
  },
  car_tax: {
    label: "Car tax",
    icon: "receipt",
    scope: "house",
    personKinds: [],
    defaultRemindDays: 14,
  },
  car_insurance: {
    label: "Car insurance",
    icon: "shield",
    scope: "house",
    personKinds: [],
    defaultRemindDays: 14,
  },
  home_insurance: {
    label: "Home insurance",
    icon: "home",
    scope: "house",
    personKinds: [],
    defaultRemindDays: 14,
  },
  boiler_service: {
    label: "Boiler service",
    icon: "flame",
    scope: "house",
    personKinds: [],
    defaultRemindDays: 14,
  },
  tv_licence: {
    label: "TV licence",
    icon: "tv",
    scope: "house",
    personKinds: [],
    defaultRemindDays: 14,
  },
  other: {
    label: "Other",
    icon: "file-question",
    scope: "person",
    personKinds: ["adult", "child", "other"],
    defaultRemindDays: 14,
  },
};

export type RenewalRepeat = {
  unit: RepeatUnit;
  every: number;
};

export type RenewalItem = {
  id: string;
  household_id: string;
  person_id: string | null;
  title: string;
  kind: RenewalKind;
  due_date: string | null;
  repeat_unit: RepeatUnit;
  repeat_every: number;
  remind_days: number;
  reference: string | null;
  provider: string | null;
  cost: number | string | null;
  notes: string | null;
  document_id: string | null;
  source: RenewalSource;
  status: RenewalStatus;
  last_done_at: string | null;
  created_at: string;
  updated_at: string;
};

export const RENEWAL_ITEMS_SELECT =
  "id, household_id, person_id, title, kind, due_date, repeat_unit, repeat_every, remind_days, reference, provider, cost, notes, document_id, source, status, last_done_at, created_at, updated_at";

export function asRenewalKind(value: unknown): RenewalKind | null {
  return (RENEWAL_KINDS as readonly string[]).includes(value as string)
    ? (value as RenewalKind)
    : null;
}

/** Default repeat for a kind — passport length depends on the person's kind. */
export function defaultRepeat(
  kind: RenewalKind,
  personKind?: PersonKind | null
): RenewalRepeat {
  switch (kind) {
    case "passport":
      return { unit: "year", every: personKind === "child" ? 5 : 10 };
    case "driving_licence":
      return { unit: "year", every: 10 };
    case "ghic":
      return { unit: "year", every: 5 };
    case "car_mot":
    case "car_tax":
    case "car_insurance":
    case "home_insurance":
    case "boiler_service":
    case "tv_licence":
      return { unit: "year", every: 1 };
    default:
      return { unit: "none", every: 1 };
  }
}

export function defaultRemindDays(kind: RenewalKind): number {
  return RENEWAL_KIND_META[kind].defaultRemindDays;
}

/** House-level suggestion kinds. */
export const HOUSE_SUGGESTION_KINDS: RenewalKind[] = [
  "car_mot",
  "car_tax",
  "car_insurance",
  "home_insurance",
  "boiler_service",
  "tv_licence",
];

/** Person-level suggestion kinds for a given person kind. */
export function personSuggestionKinds(kind: PersonKind): RenewalKind[] {
  if (kind === "child") return ["passport"];
  if (kind === "adult") return ["passport", "driving_licence", "ghic"];
  return [];
}

function listOk<T>(items: T[]): FamilyList<T> {
  return { items, fault: null };
}

function listFault<T>(label: string, message: string): FamilyList<T> {
  console.error(`[renewals] ${label}`, message);
  return {
    items: [],
    fault: "We couldn’t load renewals just now. Try refreshing the page.",
  };
}

export async function loadRenewalItems(
  supabase: SupabaseClient,
  householdId: string
): Promise<FamilyList<RenewalItem>> {
  const { data, error } = await supabase
    .from("renewal_items")
    .select(RENEWAL_ITEMS_SELECT)
    .eq("household_id", householdId)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  if (error) return listFault("loadRenewalItems", error.message);
  return listOk((data as RenewalItem[] | null) ?? []);
}

/** Roll a due date forward by repeat_unit/every, month-end safe. */
export function nextDueDate(
  due: string,
  unit: RepeatUnit,
  every: number
): string | null {
  if (unit === "none") return null;
  const parts = parseDateParts(due);
  if (!parts) return null;

  let year = parts.year;
  let month = parts.month;
  let day = parts.day;

  if (unit === "month") {
    month += every;
    while (month > 12) {
      month -= 12;
      year += 1;
    }
    while (month < 1) {
      month += 12;
      year -= 1;
    }
  } else if (unit === "year") {
    year += every;
  }

  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  day = Math.min(day, lastDay);

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Advance due_date by at least one repeat step, then until it is strictly in the future. */
export function rollDueDateForward(
  due: string,
  unit: RepeatUnit,
  every: number,
  now: Date = new Date()
): string {
  if (unit === "none") return due;
  const first = nextDueDate(due, unit, every);
  if (!first || first === due) return due;
  let current = first;
  let away = daysUntil(current, now);
  while (away !== null && away <= 0) {
    const next = nextDueDate(current, unit, every);
    if (!next || next === current) break;
    current = next;
    away = daysUntil(current, now);
  }
  return current;
}

export type RenewalWindow = {
  daysAway: number;
  inWindow: boolean;
  overdue: boolean;
};

export function renewalWindow(
  item: Pick<RenewalItem, "due_date" | "remind_days" | "status">,
  now: Date = new Date()
): RenewalWindow | null {
  if (item.status !== "active" || !item.due_date) return null;
  const daysAway = daysUntil(item.due_date, now);
  if (daysAway === null) return null;
  const overdue = daysAway < 0;
  const inWindow = overdue || daysAway <= item.remind_days;
  return { daysAway, inWindow, overdue };
}

export type RenewalStatusTone = "ochre" | "oxblood" | "faint";

/** Status word colour — ochre in the remind window, oxblood when overdue, faint otherwise. */
export function renewalStatusTone(
  item: Pick<RenewalItem, "due_date" | "remind_days" | "status">,
  now: Date = new Date()
): RenewalStatusTone {
  const win = renewalWindow(item, now);
  if (!win) return "faint";
  if (win.overdue) return "oxblood";
  if (win.inWindow) return "ochre";
  return "faint";
}

/** "Renews in N days" / "Due today" / "Overdue by N days". */
export function renewalStatusLabel(
  item: Pick<RenewalItem, "due_date" | "remind_days" | "status" | "repeat_unit">,
  now: Date = new Date()
): string {
  if (item.status === "done") return "Done";
  if (!item.due_date) return "";
  const away = daysUntil(item.due_date, now);
  if (away === null) return "";
  if (away < 0) {
    const n = Math.abs(away);
    return n === 1 ? "Overdue by 1 day" : `Overdue by ${n} days`;
  }
  if (away === 0) return "Due today";
  if (item.repeat_unit !== "none") {
    return away === 1 ? "Renews tomorrow" : `Renews in ${away} days`;
  }
  return away === 1 ? "Due tomorrow" : `Due in ${away} days`;
}

/** Short repeat summary for a card. */
export function repeatSummary(unit: RepeatUnit, every: number): string | null {
  if (unit === "none") return null;
  if (unit === "month") {
    return every === 1 ? "Every month" : `Every ${every} months`;
  }
  return every === 1 ? "Every year" : `Every ${every} years`;
}

function trackedKey(personId: string | null, kind: RenewalKind): string {
  return `${personId ?? "house"}:${kind}`;
}

/**
 * Suggestion chips still worth showing — hides kinds already tracked
 * (active or done) or dismissed for that person/house.
 */
export function suggestionsFor(
  scope: RenewalScope,
  person: HouseholdPerson | null,
  items: readonly RenewalItem[]
): RenewalKind[] {
  const personId = scope === "house" ? null : person?.id ?? null;
  const hidden = new Set<string>();

  for (const item of items) {
    const sameScope =
      scope === "house"
        ? item.person_id === null
        : item.person_id === personId;
    if (!sameScope) continue;
    if (
      item.status === "active" ||
      item.status === "done" ||
      item.status === "dismissed"
    ) {
      hidden.add(trackedKey(item.person_id, item.kind));
    }
  }

  const candidates =
    scope === "house"
      ? HOUSE_SUGGESTION_KINDS
      : person
        ? personSuggestionKinds(person.kind)
        : [];

  return candidates.filter(
    (kind) => !hidden.has(trackedKey(personId, kind))
  );
}

/** Infer a renewal kind from a document's category and title/filename. */
export function inferRenewalKindFromDocument(doc: DocumentRow): RenewalKind {
  const hay = [
    doc.original_filename,
    doc.doc_type,
    doc.provider,
    effectiveCategory(doc),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/passport/.test(hay)) return "passport";
  if (/driv(ing|er).?licen[cs]e|licen[cs]e/.test(hay) && /car|motor|driv/.test(hay)) {
    return "driving_licence";
  }
  if (/ghic|ehic|global health/.test(hay)) return "ghic";
  if (/\bmot\b|ministry of transport/.test(hay)) return "car_mot";
  if (/car tax|vehicle tax|road tax|ved/.test(hay)) return "car_tax";
  if (/tv licen[cs]e|television licen[cs]e/.test(hay)) return "tv_licence";
  if (/boiler|heating service|gas service/.test(hay)) return "boiler_service";
  if (/insurance|policy/.test(hay)) {
    if (/car|motor|vehicle|auto/.test(hay)) return "car_insurance";
    if (/home|house|building|contents/.test(hay)) return "home_insurance";
    const cat = effectiveCategory(doc);
    if (cat === "Insurance") {
      return /car|motor|vehicle/.test(hay) ? "car_insurance" : "home_insurance";
    }
  }

  const cat = effectiveCategory(doc) as Category | null;
  if (cat === "Insurance") {
    return /car|motor|vehicle/.test(hay) ? "car_insurance" : "home_insurance";
  }

  return "other";
}

export function documentRenewalDue(doc: DocumentRow): string | null {
  return doc.renewal_date ?? doc.end_date ?? null;
}

export function renewalByDocumentId(
  items: readonly RenewalItem[]
): Map<string, RenewalItem> {
  const map = new Map<string, RenewalItem>();
  for (const item of items) {
    if (item.document_id && item.status !== "dismissed") {
      map.set(item.document_id, item);
    }
  }
  return map;
}

export type RenewalDraft = {
  id?: string;
  person_id: string | null;
  title: string;
  kind: RenewalKind;
  due_date: string;
  repeat_unit: RepeatUnit;
  repeat_every: number;
  remind_days: number;
  reference: string | null;
  provider: string | null;
  cost: string | null;
  notes: string | null;
  document_id: string | null;
  source: RenewalSource;
};

export function draftFromKind(
  kind: RenewalKind,
  opts: {
    person?: HouseholdPerson | null;
    personName?: string;
    document?: DocumentRow | null;
  } = {}
): RenewalDraft {
  const meta = RENEWAL_KIND_META[kind];
  const person = opts.person ?? null;
  const repeat = defaultRepeat(kind, person?.kind);
  const title =
    opts.document?.original_filename ??
    (person ? `${person.name}'s ${meta.label}` : meta.label);

  return {
    person_id: meta.scope === "house" ? null : person?.id ?? null,
    title,
    kind,
    due_date: opts.document ? documentRenewalDue(opts.document) ?? "" : "",
    repeat_unit: repeat.unit,
    repeat_every: repeat.every,
    remind_days: defaultRemindDays(kind),
    reference: opts.document?.reference ?? null,
    provider: opts.document?.provider ?? null,
    cost: opts.document?.amount != null ? String(opts.document.amount) : null,
    notes: null,
    document_id: opts.document?.id ?? null,
    source: opts.document ? "document" : "suggestion",
  };
}
