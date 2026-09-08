"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";
import { runExtractionForDocument } from "@/lib/extraction";

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

// --- review + reprocess -------------------------------------------------

export type ReviewState = { error?: string; ok?: boolean } | undefined;

const DATE_KEYS = ["start_date", "end_date", "renewal_date"] as const;

function parseDateInput(raw: string): string | null | "invalid" {
  const v = raw.trim();
  if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) {
    return "invalid";
  }
  return v;
}

/** Save the user's edits to the extracted fields and mark the row confirmed. */
export async function confirmExtraction(
  _prev: ReviewState,
  formData: FormData
): Promise<ReviewState> {
  const documentId = String(formData.get("document_id") ?? "");
  if (!documentId) return { error: "Missing document." };

  const supabase = await createClient();
  const resolved = await resolveHousehold(supabase);
  if (!resolved.ok) return { error: resolved.error };

  const text = (key: string) => {
    const value = String(formData.get(key) ?? "").trim();
    return value.length > 0 ? value : null;
  };

  const patch: Record<string, unknown> = { extraction_status: "confirmed" };

  patch.doc_type = text("document_type");
  patch.provider = text("provider");
  patch.reference = text("reference");
  patch.key_contact_name = text("key_contact_name");
  patch.key_contact_phone = text("key_contact_phone");

  for (const key of DATE_KEYS) {
    const parsed = parseDateInput(String(formData.get(key) ?? ""));
    if (parsed === "invalid") {
      return { error: `${key.replace("_", " ")} must be YYYY-MM-DD or blank.` };
    }
    patch[key] = parsed;
  }

  const amountRaw = String(formData.get("amount") ?? "").trim();
  if (amountRaw) {
    const amount = Number(amountRaw.replace(/[^0-9.\-]/g, ""));
    if (!Number.isFinite(amount)) return { error: "Amount must be a number." };
    patch.amount = amount;
  } else {
    patch.amount = null;
  }

  const currencyRaw = String(formData.get("currency") ?? "").trim().toUpperCase();
  if (currencyRaw && !/^[A-Z]{3}$/.test(currencyRaw)) {
    return { error: "Currency must be a 3-letter code (e.g. GBP) or blank." };
  }
  patch.currency = currencyRaw || null;

  const { error } = await supabase
    .from("documents")
    .update(patch)
    .eq("id", documentId)
    .eq("household_id", resolved.householdId);
  if (error) return { error: error.message };

  revalidatePath("/documents");
  return { ok: true };
}

/** Re-run extraction for a document the caller owns (needs_review / failed). */
export async function reprocessDocument(
  _prev: ReviewState,
  formData: FormData
): Promise<ReviewState> {
  const documentId = String(formData.get("document_id") ?? "");
  if (!documentId) return { error: "Missing document." };

  const supabase = await createClient();
  const resolved = await resolveHousehold(supabase);
  if (!resolved.ok) return { error: resolved.error };

  const { data: doc } = await supabase
    .from("documents")
    .select("id")
    .eq("id", documentId)
    .eq("household_id", resolved.householdId)
    .maybeSingle();
  if (!doc) return { error: "Document not found." };

  const result = await runExtractionForDocument(documentId);
  revalidatePath("/documents");
  if (result.error && result.status === "failed") {
    return { error: `Extraction failed: ${result.error}` };
  }
  return { ok: true };
}
