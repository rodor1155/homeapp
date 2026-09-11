// The household's shopping lists.
// Client-safe: the shapes, the loaders (which take a client) and the little
// bit of shaping the screens do, so /lists, a single list and the dashboard
// all share one definition of them.

import type { SupabaseClient } from "@supabase/supabase-js";

/** A list someone started: the weekly shop, the DIY run, Christmas. */
export type ShoppingList = {
  id: string;
  name: string;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

/** A line on a list. Either still to get, or already in the basket. */
export type ShoppingItem = {
  id: string;
  list_id: string;
  title: string;
  checked: boolean;
  sort_order: number;
  checked_at: string | null;
};

export const SHOPPING_LISTS_SELECT =
  "id, name, notes, sort_order, created_at, updated_at";

export const SHOPPING_ITEMS_SELECT =
  "id, list_id, title, checked, sort_order, checked_at";

/** More lines than any shopping list has, and enough to never truncate one. */
const ITEM_ROW_CAP = 500;

/**
 * Every list in the household, in the order they should be shown. A failure —
 * including the tables not being deployed yet — reads as "no lists", so a page
 * never falls over on the shopping.
 */
export async function loadShoppingLists(
  supabase: SupabaseClient,
  householdId: string
): Promise<ShoppingList[]> {
  const { data, error } = await supabase
    .from("shopping_lists")
    .select(SHOPPING_LISTS_SELECT)
    .eq("household_id", householdId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return [];
  return (data as ShoppingList[] | null) ?? [];
}

/** One list, or null if it isn't this household's (or isn't there at all). */
export async function loadShoppingList(
  supabase: SupabaseClient,
  householdId: string,
  listId: string
): Promise<ShoppingList | null> {
  const { data, error } = await supabase
    .from("shopping_lists")
    .select(SHOPPING_LISTS_SELECT)
    .eq("household_id", householdId)
    .eq("id", listId)
    .maybeSingle();
  if (error) return null;
  return (data as ShoppingList | null) ?? null;
}

/**
 * The lines on one list, in the order they were written down. Soft-fails to
 * an empty list the same way everything else here does.
 */
export async function loadShoppingItems(
  supabase: SupabaseClient,
  householdId: string,
  listId: string
): Promise<ShoppingItem[]> {
  const { data, error } = await supabase
    .from("shopping_list_items")
    .select(SHOPPING_ITEMS_SELECT)
    .eq("household_id", householdId)
    .eq("list_id", listId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(ITEM_ROW_CAP);
  if (error) return [];
  return (data as ShoppingItem[] | null) ?? [];
}

/**
 * How many things are still to get on each list, keyed by list id. One query
 * for the whole household — the lists screen and the home screen both only
 * need the number.
 */
export async function loadOutstandingCounts(
  supabase: SupabaseClient,
  householdId: string
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const { data, error } = await supabase
    .from("shopping_list_items")
    .select("list_id")
    .eq("household_id", householdId)
    .eq("checked", false)
    .limit(ITEM_ROW_CAP);
  if (error || !data) return counts;

  for (const row of data as { list_id: string }[]) {
    counts.set(row.list_id, (counts.get(row.list_id) ?? 0) + 1);
  }
  return counts;
}

/**
 * A list's lines split into what is still to get and what is in the basket.
 * Ticked things sink to the bottom rather than disappearing, so an accidental
 * tap is one tap to undo.
 */
export function splitItems(items: readonly ShoppingItem[]): {
  toGet: ShoppingItem[];
  inBasket: ShoppingItem[];
} {
  const toGet: ShoppingItem[] = [];
  const inBasket: ShoppingItem[] = [];
  for (const item of items) {
    (item.checked ? inBasket : toGet).push(item);
  }
  return { toGet, inBasket };
}

/** "3 to get" / "Nothing to get" — the same phrase everywhere it is said. */
export function outstandingLabel(count: number): string {
  if (count === 0) return "Nothing to get";
  return `${count} to get`;
}
