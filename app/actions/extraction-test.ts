"use server";

import { extractDocument, type ExtractionOutcome } from "@/lib/extraction";
import { loadHouseholdContext } from "@/lib/household";

export type TestExtractionState =
  | { outcome?: ExtractionOutcome; error?: string; filename?: string }
  | undefined;

const MAX_TEST_BYTES = 25 * 1024 * 1024;

function isInternalUser(email: string | undefined): boolean {
  const allow = process.env.INTERNAL_TOOLS_EMAILS;
  if (!allow) return true; // no allow-list set → any signed-in user
  const list = allow
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return !!email && list.includes(email.toLowerCase());
}

function guessMime(filename: string): string {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  const map: Record<string, string> = {
    pdf: "application/pdf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
  };
  return map[ext] ?? "application/octet-stream";
}

/**
 * Internal benchmark harness: run raw extraction on an uploaded file and return
 * the full outcome. No Storage, no database, no household context.
 */
export async function runTestExtraction(
  _prev: TestExtractionState,
  formData: FormData
): Promise<TestExtractionState> {
  const { user } = await loadHouseholdContext();
  if (!user) return { error: "Sign in to use the extraction test page." };
  if (!isInternalUser(user.email)) {
    return { error: "Your account is not on the internal-tools allow-list." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a document to test." };
  }
  if (file.size > MAX_TEST_BYTES) {
    return { error: "File is larger than 25 MB." };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    const outcome = await extractDocument({
      bytes,
      mime: file.type || guessMime(file.name),
      filename: file.name,
    });
    return { outcome, filename: file.name };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Extraction crashed.",
      filename: file.name,
    };
  }
}
