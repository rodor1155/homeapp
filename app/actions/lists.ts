"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";

/* The household's shopping lists. Everything here runs on the cookie client,
   so RLS decides what the caller can touch; the household is resolved the
   same way the rest of the app resolves it — the oldest membership.

   Two shapes of action, on purpose: the forms (start a list, rename it, add a
   line) are useActionState actions taking FormData, and the taps (tick,
   delete, clear, move) take plain arguments so a row can call them straight
   from a transition without a form around it. */

export type ListState = { error?: string; ok?: boolean } | undefined;

/** Long enough for "Cathedral City extra mature", short enough to be a line. */
const MAX_TITLE = 200;
const MAX_NAME = 80;

type Caller =
  | { ok: false; error: string }
  | { ok: true; householdId: string };

async function resolveCaller(supabase: SupabaseClient): Promise<Caller> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: membership } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!membership) {
    return { ok: false, error: "No household found for your account." };
  }

  return { ok: true, householdId: membership.household_id as string };
}

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

/** A trimmed value, or null for the empty string — how every optional column is written. */
function optional(formData: FormData, key: string): string | null {
  const value = text(formData, key);
  return value ? value : null;
}

function refresh(listId?: string) {
  revalidatePath("/lists");
  if (listId) revalidatePath(`/lists/${listId}`);
  revalidatePath("/dashboard");
}

/** The list, but only if it is this household's. */
async function ownedList(
  supabase: SupabaseClient,
  householdId: string,
  listId: string
): Promise<{ id: string } | null> {
  const { data } = await supabase
    .from("shopping_lists")
    .select("id")
    .eq("id", listId)
    .eq("household_id", householdId)
    .maybeSingle();
  return (data as { id: string } | null) ?? null;
}

/** Where a new row goes: on the end of whatever is already there. */
async function nextSortOrder(
  supabase: SupabaseClient,
  table: "shopping_lists" | "shopping_list_items",
  match: Record<string, string>
): Promise<number> {
  const { data } = await supabase
    .from(table)
    .select("sort_order")
    .match(match)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  return ((data?.sort_order as number | null) ?? 0) + 1;
}

// --- lists ---------------------------------------------------------------

export async function createList(
  _prev: ListState,
  formData: FormData
): Promise<ListState> {
  const name = text(formData, "name");
  const notes = optional(formData, "notes");

  if (!name) return { error: "Give the list a name." };
  if (name.length > MAX_NAME) return { error: "That name is a bit long." };

  const supabase = await createClient();
  const caller = await resolveCaller(supabase);
  if (!caller.ok) return { error: caller.error };

  const sortOrder = await nextSortOrder(supabase, "shopping_lists", {
    household_id: caller.householdId,
  });

  const { error } = await supabase.from("shopping_lists").insert({
    household_id: caller.householdId,
    name,
    notes,
    sort_order: sortOrder,
  });
  if (error) return { error: error.message };

  refresh();
  return { ok: true };
}

export async function renameList(
  _prev: ListState,
  formData: FormData
): Promise<ListState> {
  const listId = text(formData, "list_id");
  const name = text(formData, "name");
  const notes = optional(formData, "notes");

  if (!listId) return { error: "Missing list." };
  if (!name) return { error: "Give the list a name." };
  if (name.length > MAX_NAME) return { error: "That name is a bit long." };

  const supabase = await createClient();
  const caller = await resolveCaller(supabase);
  if (!caller.ok) return { error: caller.error };

  const { error } = await supabase
    .from("shopping_lists")
    .update({ name, notes, updated_at: new Date().toISOString() })
    .eq("id", listId)
    .eq("household_id", caller.householdId);
  if (error) return { error: error.message };

  refresh(listId);
  return { ok: true };
}

/** Delete a list and everything on it. The items go with it, by cascade. */
export async function deleteList(
  _prev: ListState,
  formData: FormData
): Promise<ListState> {
  const listId = text(formData, "list_id");
  if (!listId) return { error: "Missing list." };

  const supabase = await createClient();
  const caller = await resolveCaller(supabase);
  if (!caller.ok) return { error: caller.error };

  const { error } = await supabase
    .from("shopping_lists")
    .delete()
    .eq("id", listId)
    .eq("household_id", caller.householdId);
  if (error) return { error: error.message };

  refresh(listId);
  redirect("/lists");
}

// --- items ---------------------------------------------------------------

export async function addItem(
  _prev: ListState,
  formData: FormData
): Promise<ListState> {
  const listId = text(formData, "list_id");
  const title = text(formData, "title");

  if (!listId) return { error: "Missing list." };
  if (!title) return { error: "Type what you need first." };
  if (title.length > MAX_TITLE) return { error: "That one is a bit long." };

  const supabase = await createClient();
  const caller = await resolveCaller(supabase);
  if (!caller.ok) return { error: caller.error };

  if (!(await ownedList(supabase, caller.householdId, listId))) {
    return { error: "We couldn’t find that list." };
  }

  const sortOrder = await nextSortOrder(supabase, "shopping_list_items", {
    household_id: caller.householdId,
    list_id: listId,
  });

  const { error } = await supabase.from("shopping_list_items").insert({
    household_id: caller.householdId,
    list_id: listId,
    title,
    sort_order: sortOrder,
  });
  if (error) return { error: error.message };

  refresh(listId);
  return { ok: true };
}

export async function renameItem(
  _prev: ListState,
  formData: FormData
): Promise<ListState> {
  const itemId = text(formData, "item_id");
  const title = text(formData, "title");

  if (!itemId) return { error: "Missing item." };
  if (!title) return { error: "Say what it is." };
  if (title.length > MAX_TITLE) return { error: "That one is a bit long." };

  const supabase = await createClient();
  const caller = await resolveCaller(supabase);
  if (!caller.ok) return { error: caller.error };

  const { data, error } = await supabase
    .from("shopping_list_items")
    .update({ title })
    .eq("id", itemId)
    .eq("household_id", caller.householdId)
    .select("list_id")
    .maybeSingle();
  if (error) return { error: error.message };

  refresh((data?.list_id as string | undefined) ?? undefined);
  return { ok: true };
}

/** Tick or un-tick a line. The one action a shopping trip actually uses. */
export async function setItemChecked(
  itemId: string,
  checked: boolean
): Promise<ListState> {
  if (!itemId) return { error: "Missing item." };

  const supabase = await createClient();
  const caller = await resolveCaller(supabase);
  if (!caller.ok) return { error: caller.error };

  const { data, error } = await supabase
    .from("shopping_list_items")
    .update({ checked, checked_at: checked ? new Date().toISOString() : null })
    .eq("id", itemId)
    .eq("household_id", caller.householdId)
    .select("list_id")
    .maybeSingle();
  if (error) return { error: error.message };

  refresh((data?.list_id as string | undefined) ?? undefined);
  return { ok: true };
}

export async function deleteItem(itemId: string): Promise<ListState> {
  if (!itemId) return { error: "Missing item." };

  const supabase = await createClient();
  const caller = await resolveCaller(supabase);
  if (!caller.ok) return { error: caller.error };

  const { data, error } = await supabase
    .from("shopping_list_items")
    .delete()
    .eq("id", itemId)
    .eq("household_id", caller.householdId)
    .select("list_id")
    .maybeSingle();
  if (error) return { error: error.message };

  refresh((data?.list_id as string | undefined) ?? undefined);
  return { ok: true };
}

/** Clear everything already in the basket, once the shop is done. */
export async function clearChecked(listId: string): Promise<ListState> {
  if (!listId) return { error: "Missing list." };

  const supabase = await createClient();
  const caller = await resolveCaller(supabase);
  if (!caller.ok) return { error: caller.error };

  const { error } = await supabase
    .from("shopping_list_items")
    .delete()
    .eq("list_id", listId)
    .eq("household_id", caller.householdId)
    .eq("checked", true);
  if (error) return { error: error.message };

  refresh(listId);
  return { ok: true };
}

/**
 * Move a line up or down its list. It swaps with its neighbour *in the same
 * group* — ticked things sit below un-ticked ones on screen, so swapping
 * across the two would look like nothing happened. Rows are renumbered from
 * the top as we go, which also tidies up the ties left by the default of 0.
 */
export async function moveItem(
  itemId: string,
  direction: "up" | "down"
): Promise<ListState> {
  if (!itemId) return { error: "Missing item." };

  const supabase = await createClient();
  const caller = await resolveCaller(supabase);
  if (!caller.ok) return { error: caller.error };

  const { data: item } = await supabase
    .from("shopping_list_items")
    .select("id, list_id, checked")
    .eq("id", itemId)
    .eq("household_id", caller.householdId)
    .maybeSingle();
  if (!item) return { error: "We couldn’t find that item." };

  const { data: rows, error } = await supabase
    .from("shopping_list_items")
    .select("id, sort_order, checked")
    .eq("list_id", item.list_id as string)
    .eq("household_id", caller.householdId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return { error: error.message };

  const ordered = (rows as { id: string; sort_order: number; checked: boolean }[]) ?? [];
  const group = ordered.filter((row) => row.checked === (item.checked as boolean));
  const at = group.findIndex((row) => row.id === itemId);
  const neighbour = group[direction === "up" ? at - 1 : at + 1];
  // Already at the end of its group: nothing to do, and not an error.
  if (at === -1 || !neighbour) return { ok: true };

  const from = ordered.findIndex((row) => row.id === itemId);
  const to = ordered.findIndex((row) => row.id === neighbour.id);
  [ordered[from], ordered[to]] = [ordered[to], ordered[from]];

  const writes = ordered
    .map((row, index) => ({ row, position: index + 1 }))
    .filter(({ row, position }) => row.sort_order !== position)
    .map(({ row, position }) =>
      supabase
        .from("shopping_list_items")
        .update({ sort_order: position })
        .eq("id", row.id)
        .eq("household_id", caller.householdId)
    );

  const results = await Promise.all(writes);
  const failed = results.find((result) => result.error);
  if (failed?.error) return { error: failed.error.message };

  refresh(item.list_id as string);
  return { ok: true };
}
