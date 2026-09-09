import type { SupabaseClient } from "@supabase/supabase-js";

/** A row of public.household_member_emails(). Client-safe shape. */
export type MemberEmail = {
  user_id: string;
  email: string | null;
};

/** A household member as the settings page shows them. Client-safe shape. */
export type HouseholdMember = {
  user_id: string;
  role: string;
  email: string | null;
};

/**
 * Everyone in the household. The membership rows come straight off the table
 * (members can read them); the email addresses live in auth.users, which is
 * not exposed, so they come from the SECURITY DEFINER function. A failure
 * there — including the function not being deployed yet — leaves the emails
 * blank rather than losing the list of people.
 */
export async function loadHouseholdMembers(
  supabase: SupabaseClient,
  householdId: string
): Promise<HouseholdMember[]> {
  const { data: rows } = await supabase
    .from("household_members")
    .select("user_id, role")
    .eq("household_id", householdId)
    .order("created_at", { ascending: true });

  const { data: emails } = await supabase.rpc("household_member_emails", {
    p_household_id: householdId,
  });

  const byId = new Map(
    ((emails as MemberEmail[] | null) ?? []).map((row) => [
      row.user_id,
      row.email,
    ])
  );

  return (rows ?? []).map((row) => {
    const userId = row.user_id as string;
    return {
      user_id: userId,
      role: row.role as string,
      email: byId.get(userId) ?? null,
    };
  });
}
