"use server";

import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";

export type DeleteAccountState = { error?: string } | undefined;

/** The word the user has to type. A "use server" module can only export async
 *  functions, so DeleteAccountPanel keeps its own copy of this. */
const CONFIRMATION = "DELETE";

/** Storage's own page size, and the most paths remove() is given at once. */
const PAGE = 1000;

type Bucket = ReturnType<SupabaseClient["storage"]["from"]>;
type StorageEntry = NonNullable<
  Awaited<ReturnType<Bucket["list"]>>["data"]
>[number];

/**
 * Deleting the auth user cascades through every table, but Storage has no
 * foreign keys, so a household's files have to go by hand. Households the
 * caller shares with someone else are left completely alone.
 */
export async function deleteAccount(
  confirmText: string
): Promise<DeleteAccountState> {
  if (confirmText.trim() !== CONFIRMATION) {
    return { error: `Type ${CONFIRMATION} to confirm.` };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const admin = createAdminClient();

  // Files are a courtesy, not the point: if the cleanup fails the account
  // still goes, and the leftover objects become a job for the lifecycle
  // sweep rather than a reason the user can't leave.
  try {
    for (const householdId of await soleMemberHouseholds(admin, user.id)) {
      await removeHouseholdFiles(admin.storage.from("documents"), householdId);
    }
  } catch (e) {
    console.error(`[account] storage cleanup failed for ${user.id}`, e);
  }

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return { error: error.message };

  await supabase.auth.signOut();
  redirect("/");
}

/** Households the caller is in on their own — the ones that die with them. */
async function soleMemberHouseholds(
  admin: SupabaseClient,
  userId: string
): Promise<string[]> {
  const { data: mine, error } = await admin
    .from("household_members")
    .select("household_id")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);

  const ids = (mine ?? []).map((row) => row.household_id as string);
  if (ids.length === 0) return [];

  const { data: others, error: othersError } = await admin
    .from("household_members")
    .select("household_id")
    .in("household_id", ids)
    .neq("user_id", userId);
  if (othersError) throw new Error(othersError.message);

  const shared = new Set(
    (others ?? []).map((row) => row.household_id as string)
  );
  return ids.filter((id) => !shared.has(id));
}

/**
 * Every object under a household's prefix. Keys are
 * `<household_id>/<document_id>/<filename>`, so this walks the one level of
 * folders in between, and picks up anything sitting loose at the top.
 */
async function removeHouseholdFiles(
  bucket: Bucket,
  householdId: string
): Promise<void> {
  const paths: string[] = [];

  for (const entry of await listAll(bucket, householdId)) {
    // A folder comes back with a null id; a file has one.
    if (entry.id !== null) {
      paths.push(`${householdId}/${entry.name}`);
      continue;
    }
    const prefix = `${householdId}/${entry.name}`;
    for (const file of await listAll(bucket, prefix)) {
      paths.push(`${prefix}/${file.name}`);
    }
  }

  for (let i = 0; i < paths.length; i += PAGE) {
    const { error } = await bucket.remove(paths.slice(i, i + PAGE));
    if (error) throw new Error(error.message);
  }
}

async function listAll(
  bucket: Bucket,
  prefix: string
): Promise<StorageEntry[]> {
  const entries: StorageEntry[] = [];

  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await bucket.list(prefix, { limit: PAGE, offset });
    if (error) throw new Error(error.message);
    const page = data ?? [];
    entries.push(...page);
    if (page.length < PAGE) return entries;
  }
}
