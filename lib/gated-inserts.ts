import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Entitlements } from "@/lib/billing";
import { createAdminClient } from "@/lib/supabase-admin";

/* The two paid-plan writes: inviting someone and adding a family date.

   The signed-in role has no INSERT on household_invites or household_events
   (20261028130000_paywall_gated_inserts.sql), so a free household can't skip
   the paywall by writing through the Data API. Rows go through
   public.create_household_invite / public.create_household_event instead,
   which check membership and the household's plan in the database.

   The database can see Stripe and App Store subscriptions but not the
   server's environment, so the two paid cases that come from there — billing
   switched off, and the App Review demo account — are written with the
   service-role client. Callers must have resolved the household for the
   signed-in user and checked `entitlements` already; nothing here trusts the
   client. */

/** The message the gated RPCs raise when the household isn't on the paid plan. */
export const PLAN_REQUIRED = "plan_required";

export type GatedInsertResult = {
  error: string | null;
  /** The database refused because the household is on the free plan. */
  planRequired: boolean;
};

/** Paid by the server's say-so only, invisible to the database's check. */
function serverDecidedPaid(entitlements: Entitlements): boolean {
  return (
    entitlements.source === "unconfigured" ||
    entitlements.source === "review_demo"
  );
}

function result(error: { message: string } | null): GatedInsertResult {
  if (!error) return { error: null, planRequired: false };
  return {
    error: error.message,
    planRequired: error.message.includes(PLAN_REQUIRED),
  };
}

export type InviteInsert = {
  householdId: string;
  invitedBy: string;
  email?: string | null;
  token?: string | null;
  expiresAt?: string | null;
};

export async function insertHouseholdInvite(
  supabase: SupabaseClient,
  entitlements: Entitlements,
  invite: InviteInsert
): Promise<GatedInsertResult> {
  if (serverDecidedPaid(entitlements)) {
    const { error } = await createAdminClient()
      .from("household_invites")
      .insert({
        household_id: invite.householdId,
        email: invite.email ?? null,
        token: invite.token ?? null,
        expires_at: invite.expiresAt ?? null,
        invited_by: invite.invitedBy,
        status: "pending",
      });
    return result(error);
  }

  const { error } = await supabase.rpc("create_household_invite", {
    p_household_id: invite.householdId,
    p_email: invite.email ?? null,
    p_token: invite.token ?? null,
    p_expires_at: invite.expiresAt ?? null,
  });
  return result(error);
}

export type EventInsert = {
  householdId: string;
  title: string;
  event_date: string;
  event_type: string;
  person_id: string | null;
  school_id: string | null;
  notes: string | null;
};

export async function insertHouseholdEvent(
  supabase: SupabaseClient,
  entitlements: Entitlements,
  event: EventInsert
): Promise<GatedInsertResult> {
  const { householdId, ...values } = event;

  if (serverDecidedPaid(entitlements)) {
    const { error } = await createAdminClient()
      .from("household_events")
      .insert({ household_id: householdId, ...values });
    return result(error);
  }

  const { error } = await supabase.rpc("create_household_event", {
    p_household_id: householdId,
    p_title: values.title,
    p_event_date: values.event_date,
    p_event_type: values.event_type,
    p_person_id: values.person_id,
    p_school_id: values.school_id,
    p_notes: values.notes,
  });
  return result(error);
}
