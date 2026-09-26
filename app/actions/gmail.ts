"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { importDocumentFromBuffer } from "@/app/actions/documents";
import {
  disconnectGmail,
  downloadGmailAttachment,
  loadGmailConnection,
  loadPendingCandidates,
  scanGmailForCandidates,
} from "@/lib/gmail";
import { gmailSetupMessage, isGmailConfigured } from "@/lib/gmail-config";
import { createAdminClient } from "@/lib/supabase-admin";
import { queryActiveMembership } from "@/lib/household";
import { createClient } from "@/lib/supabase-server";

type ResolvedHousehold =
  | { ok: false; error: string }
  | { ok: true; userId: string; householdId: string; propertyId: string };

async function resolveHousehold(
  supabase: SupabaseClient
): Promise<ResolvedHousehold> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You are not signed in." };

  const { data: membership } = await queryActiveMembership(
    supabase,
    user.id
  );
  if (!membership) {
    return { ok: false, error: "No household found for your account." };
  }

  const { data: property } = await supabase
    .from("properties")
    .select("id")
    .eq("household_id", membership.household_id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!property) {
    return { ok: false, error: "Add your property before importing documents." };
  }

  return {
    ok: true,
    userId: user.id,
    householdId: membership.household_id as string,
    propertyId: property.id as string,
  };
}

export type GmailActionState = { error?: string; ok?: boolean; count?: number };

export async function scanGmailInbox(): Promise<GmailActionState> {
  if (!isGmailConfigured()) {
    return { error: gmailSetupMessage() };
  }

  const supabase = await createClient();
  const resolved = await resolveHousehold(supabase);
  if (!resolved.ok) return { error: resolved.error };

  const connection = await loadGmailConnection(resolved.householdId);
  if (!connection) {
    return { error: "Connect Gmail before scanning your inbox." };
  }

  const result = await scanGmailForCandidates(resolved.householdId);
  if (result.error) return { error: result.error };

  revalidatePath("/documents");
  return { ok: true, count: result.inserted };
}

export async function disconnectGmailAccount(): Promise<GmailActionState> {
  const supabase = await createClient();
  const resolved = await resolveHousehold(supabase);
  if (!resolved.ok) return { error: resolved.error };

  await disconnectGmail(resolved.householdId);
  revalidatePath("/documents");
  return { ok: true };
}

export async function dismissGmailCandidate(
  candidateId: string
): Promise<GmailActionState> {
  const supabase = await createClient();
  const resolved = await resolveHousehold(supabase);
  if (!resolved.ok) return { error: resolved.error };

  const { error } = await supabase
    .from("gmail_import_candidates")
    .update({ status: "dismissed" })
    .eq("id", candidateId)
    .eq("household_id", resolved.householdId)
    .eq("status", "pending");
  if (error) return { error: error.message };

  revalidatePath("/documents");
  return { ok: true };
}

export async function importGmailCandidates(
  candidateIds: string[],
  categories: Record<string, string> = {}
): Promise<GmailActionState & { imported?: number }> {
  if (candidateIds.length === 0) {
    return { error: "Pick at least one document to import." };
  }

  const supabase = await createClient();
  const resolved = await resolveHousehold(supabase);
  if (!resolved.ok) return { error: resolved.error };

  const connection = await loadGmailConnection(resolved.householdId);
  if (!connection) {
    return { error: "Connect Gmail before importing." };
  }

  const { data: candidates, error: loadError } = await supabase
    .from("gmail_import_candidates")
    .select("*")
    .eq("household_id", resolved.householdId)
    .eq("status", "pending")
    .in("id", candidateIds);
  if (loadError) return { error: loadError.message };
  if (!candidates?.length) {
    return { error: "Those documents are no longer available to import." };
  }

  const admin = createAdminClient();
  let imported = 0;

  for (const candidate of candidates) {
    try {
      const buffer = await downloadGmailAttachment({
        connection,
        messageId: candidate.gmail_message_id,
        attachmentId: candidate.gmail_attachment_id,
      });

      const result = await importDocumentFromBuffer({
        propertyId: resolved.propertyId,
        householdId: resolved.householdId,
        filename: candidate.filename,
        mime: "application/pdf",
        buffer,
        category: categories[candidate.id] ?? candidate.suggested_category,
      });
      if ("error" in result) throw new Error(result.error);

      await admin
        .from("gmail_import_candidates")
        .update({
          status: "imported",
          document_id: result.documentId,
          import_error: null,
        })
        .eq("id", candidate.id);
      imported += 1;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Import failed.";
      await admin
        .from("gmail_import_candidates")
        .update({ status: "failed", import_error: message.slice(0, 500) })
        .eq("id", candidate.id);
    }
  }

  revalidatePath("/documents");
  revalidatePath("/dashboard");
  if (imported === 0) {
    return { error: "None of the selected documents could be imported." };
  }
  return { ok: true, imported };
}

export async function getPendingGmailCandidates() {
  const supabase = await createClient();
  const resolved = await resolveHousehold(supabase);
  if (!resolved.ok) return [];

  return loadPendingCandidates(resolved.householdId);
}
