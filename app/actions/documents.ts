"use server";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";

export type UploadTarget =
  | { documentId: string; path: string; token: string }
  | { error: string };

export type RecordResult = { ok: true } | { error: string };

function safeFilename(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[^\w.\- ]+/g, "_")
    .replace(/\s+/g, "_");
  return cleaned.slice(-120) || "upload";
}

type ResolvedHousehold =
  | { ok: false; error: string }
  | { ok: true; userId: string; householdId: string };

async function resolveHousehold(
  supabase: SupabaseClient
): Promise<ResolvedHousehold> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You are not signed in." };

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

  return {
    ok: true,
    userId: user.id,
    householdId: membership.household_id as string,
  };
}

/** Step 1: mint a document id and a one-time signed upload URL for Storage. */
export async function createUploadTarget(input: {
  propertyId: string;
  filename: string;
  mime: string;
}): Promise<UploadTarget> {
  const supabase = await createClient();
  const resolved = await resolveHousehold(supabase);
  if (!resolved.ok) return { error: resolved.error };

  const { data: property } = await supabase
    .from("properties")
    .select("id")
    .eq("id", input.propertyId)
    .eq("household_id", resolved.householdId)
    .maybeSingle();
  if (!property) return { error: "That property is not in your household." };

  const documentId = randomUUID();
  const path = `${resolved.householdId}/${documentId}/${safeFilename(
    input.filename
  )}`;

  const { data, error } = await supabase.storage
    .from("documents")
    .createSignedUploadUrl(path);
  if (error || !data) {
    return { error: error?.message ?? "Could not start the upload." };
  }

  return { documentId, path: data.path, token: data.token };
}

/** Step 2: record the uploaded file. Extraction happens in a later session. */
export async function recordDocument(input: {
  documentId: string;
  propertyId: string;
  path: string;
  filename: string;
  mime: string | null;
}): Promise<RecordResult> {
  const supabase = await createClient();
  const resolved = await resolveHousehold(supabase);
  if (!resolved.ok) return { error: resolved.error };

  const { error } = await supabase.from("documents").insert({
    id: input.documentId,
    household_id: resolved.householdId,
    property_id: input.propertyId,
    storage_path: input.path,
    original_filename: input.filename.slice(0, 300),
    mime: input.mime,
    extraction_status: "pending",
  });
  if (error) return { error: error.message };

  return { ok: true };
}
