"use server";

import { redirect } from "next/navigation";
import {
  AccountDeletionError,
  deleteAccountForUser,
} from "@/lib/account-deletion";
import { createClient } from "@/lib/supabase-server";

export type DeleteAccountState = { error?: string } | undefined;

/** The word the user has to type. A "use server" module can only export async
 *  functions, so DeleteAccountPanel keeps its own copy of this. */
const CONFIRMATION = "DELETE";

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

  try {
    await deleteAccountForUser(user.id);
  } catch (e) {
    if (e instanceof AccountDeletionError) {
      return { error: e.message };
    }
    console.error(`[account] deletion failed for ${user.id}`, e);
    return {
      error: "Something went wrong while deleting your account. Please try again.",
    };
  }

  await supabase.auth.signOut();
  redirect("/account-deleted");
}
