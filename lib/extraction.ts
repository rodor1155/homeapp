import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { PDFDocument } from "pdf-lib";
import { syncRemindersForDocument } from "@/lib/reminders";
import { createAdminClient } from "@/lib/supabase-admin";

// The user pinned this model for the extraction benchmark.
export const EXTRACTION_MODEL = "claude-sonnet-4-6";

// Anything longer / bigger is parked for the OCR-fallback phase rather than
// burned on a best-effort vision pass.
export const MAX_DOCUMENT_PAGES = 8;
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

export const EXTRACTION_FIELD_KEYS = [
  "document_type",
  "provider",
  "reference",
  "start_date",
  "end_date",
  "renewal_date",
  "amount",
  "currency",
  "key_contact_name",
  "key_contact_phone",
] as const;

export type ExtractionFieldKey = (typeof EXTRACTION_FIELD_KEYS)[number];
export type Confidence = "high" | "medium" | "low";
export type ExtractionStatus = "extracted" | "needs_review" | "failed";

export type ExtractionField = {
  value: string | null;
  confidence: Confidence;
  ambiguity: string | null;
};

export type ExtractionOutcome = {
  status: ExtractionStatus;
  fields: Record<ExtractionFieldKey, ExtractionField> | null;
  full_text: string;
  page_count: number | null;
  overall_confidence: Confidence | null;
  flags: string[];
  model: string;
  error: string | null;
};

type SupportedInput =
  | { kind: "pdf"; mediaType: "application/pdf" }
  | {
      kind: "image";
      mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
    };

const FIELD_GUIDANCE: Record<ExtractionFieldKey, string> = {
  document_type:
    "Short label for the kind of document, e.g. 'buildings insurance', 'contents insurance', 'boiler warranty', 'appliance warranty', 'mortgage statement', 'utility bill', 'tenancy agreement', 'EPC', 'service plan', 'guarantee'.",
  provider:
    "The company or organisation that issued the document (insurer, manufacturer, utility, lender, letting agent).",
  reference:
    "Policy number, account number, contract number or other primary reference.",
  start_date:
    "Cover or agreement start date. ISO 8601 (YYYY-MM-DD). Null if not stated.",
  end_date:
    "Cover or agreement end / expiry date. ISO 8601 (YYYY-MM-DD). Null if not stated.",
  renewal_date:
    "Renewal date, only if stated separately from the end date. ISO 8601 (YYYY-MM-DD).",
  amount:
    "Primary monetary amount (premium, price, or balance) as a plain number: no currency symbol, no thousands separators.",
  currency: "ISO 4217 currency code for the amount, e.g. GBP, USD, EUR.",
  key_contact_name:
    "Name of the main named contact person or team, if the document names one.",
  key_contact_phone:
    "Primary phone number for the provider or contact. Digits, spaces and a leading + only.",
};

const SYSTEM_PROMPT = `You extract structured data from household documents (insurance policies, warranties, utility bills, tenancy agreements, mortgage statements and similar).

Rules:
- Only report what the document actually states. Never guess or infer a value that is not written down — use null instead.
- For every field give a confidence of "high", "medium" or "low". Use "high" only when the value is stated unambiguously in plain terms.
- If the document contains more than one plausible value for a field (for example several dates that could each be the start date), set the value to your best single choice, lower the confidence, and describe the alternatives in "ambiguity". Do not silently pick one.
- Dates must be ISO 8601 (YYYY-MM-DD). If only a month/year is given, return null and note it in "ambiguity".
- "amount" is a plain number with no symbols or separators.
- Also transcribe the full readable text of the document into "full_text", preserving reading order and line breaks, covering every page.`;

function detectInput(mime: string, filename: string): SupportedInput | null {
  const m = (mime || "").toLowerCase();
  const ext = filename.toLowerCase().split(".").pop() ?? "";

  if (m === "application/pdf" || ext === "pdf") {
    return { kind: "pdf", mediaType: "application/pdf" };
  }
  if (m === "image/jpeg" || m === "image/jpg" || ext === "jpg" || ext === "jpeg") {
    return { kind: "image", mediaType: "image/jpeg" };
  }
  if (m === "image/png" || ext === "png") {
    return { kind: "image", mediaType: "image/png" };
  }
  if (m === "image/webp" || ext === "webp") {
    return { kind: "image", mediaType: "image/webp" };
  }
  if (m === "image/gif" || ext === "gif") {
    return { kind: "image", mediaType: "image/gif" };
  }
  return null;
}

async function countPdfPages(bytes: Uint8Array): Promise<number | null> {
  try {
    const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
    return pdf.getPageCount();
  } catch {
    return null;
  }
}

function fieldSchema(key: ExtractionFieldKey) {
  return {
    type: "object",
    description: FIELD_GUIDANCE[key],
    properties: {
      value: {
        type: ["string", "null"],
        description: `${FIELD_GUIDANCE[key]} Null if the document does not state it.`,
      },
      confidence: {
        type: "string",
        enum: ["high", "medium", "low"],
      },
      ambiguity: {
        type: ["string", "null"],
        description:
          "If the document offers multiple plausible values for this field, describe them here. Null if unambiguous.",
      },
    },
    required: ["value", "confidence", "ambiguity"],
    additionalProperties: false,
  };
}

function buildTool(): Anthropic.Tool {
  const properties: Record<string, unknown> = {};
  for (const key of EXTRACTION_FIELD_KEYS) properties[key] = fieldSchema(key);
  properties.full_text = {
    type: "string",
    description:
      "Full plain-text transcription of the document, every page, in reading order.",
  };

  return {
    name: "record_extraction",
    description: "Record the structured data extracted from the document.",
    input_schema: {
      type: "object",
      properties,
      required: [...EXTRACTION_FIELD_KEYS, "full_text"],
      additionalProperties: false,
    },
  } as Anthropic.Tool;
}

function coerceConfidence(raw: unknown): Confidence {
  return raw === "high" || raw === "medium" || raw === "low" ? raw : "low";
}

function coerceField(raw: unknown): ExtractionField {
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    const value =
      typeof r.value === "string" && r.value.trim().length > 0
        ? r.value.trim()
        : null;
    const ambiguity =
      typeof r.ambiguity === "string" && r.ambiguity.trim().length > 0
        ? r.ambiguity.trim()
        : null;
    return { value, confidence: coerceConfidence(r.confidence), ambiguity };
  }
  return { value: null, confidence: "low", ambiguity: null };
}

function summariseConfidence(
  fields: Record<ExtractionFieldKey, ExtractionField>
): { overall: Confidence | null; allLow: boolean; anyBelowHigh: boolean } {
  const scored = EXTRACTION_FIELD_KEYS.map((k) => fields[k]).filter(
    (f) => f.value !== null
  );
  if (scored.length === 0) return { overall: null, allLow: false, anyBelowHigh: false };

  const low = scored.filter((f) => f.confidence === "low").length;
  const high = scored.filter((f) => f.confidence === "high").length;
  const allLow = low === scored.length;
  const anyBelowHigh = high < scored.length;

  let overall: Confidence = "medium";
  if (high === scored.length) overall = "high";
  else if (low >= scored.length - low) overall = "low";

  return { overall, allLow, anyBelowHigh };
}

/**
 * Runs Claude vision extraction on raw file bytes. Pure — no database or
 * storage access. Throws only on programmer error; API and parsing problems
 * come back as a `failed` / `needs_review` outcome.
 */
export async function extractDocument(input: {
  bytes: Uint8Array;
  mime: string;
  filename: string;
}): Promise<ExtractionOutcome> {
  const base: Omit<ExtractionOutcome, "status" | "flags"> = {
    fields: null,
    full_text: "",
    page_count: null,
    overall_confidence: null,
    model: EXTRACTION_MODEL,
    error: null,
  };

  const detected = detectInput(input.mime, input.filename);
  if (!detected) {
    return {
      ...base,
      status: "failed",
      flags: ["unsupported_type"],
      error: `Unsupported file type: ${input.mime || input.filename}`,
    };
  }

  if (input.bytes.byteLength > MAX_FILE_BYTES) {
    return {
      ...base,
      status: "needs_review",
      flags: ["file_too_large"],
      error: `File is ${(input.bytes.byteLength / 1024 / 1024).toFixed(1)} MB (limit ${MAX_FILE_BYTES / 1024 / 1024} MB)`,
    };
  }

  const pageCount =
    detected.kind === "pdf" ? await countPdfPages(input.bytes) : 1;

  if (pageCount !== null && pageCount > MAX_DOCUMENT_PAGES) {
    return {
      ...base,
      status: "needs_review",
      page_count: pageCount,
      flags: ["long_document"],
      error: `${pageCount} pages — parked for the OCR-fallback phase`,
    };
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      ...base,
      status: "failed",
      page_count: pageCount,
      flags: ["no_api_key"],
      error: "ANTHROPIC_API_KEY is not configured",
    };
  }

  const b64 = Buffer.from(input.bytes).toString("base64");
  const client = new Anthropic();

  let message: Anthropic.Message;
  try {
    message = await client.messages.create({
      model: EXTRACTION_MODEL,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      tools: [buildTool()],
      tool_choice: { type: "tool", name: "record_extraction" },
      messages: [
        {
          role: "user",
          content: [
            detected.kind === "pdf"
              ? {
                  type: "document",
                  source: {
                    type: "base64",
                    media_type: "application/pdf",
                    data: b64,
                  },
                }
              : {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: detected.mediaType,
                    data: b64,
                  },
                },
            {
              type: "text",
              text: "Extract this document's data using the record_extraction tool.",
            },
          ],
        },
      ],
    });
  } catch (e) {
    return {
      ...base,
      status: "failed",
      page_count: pageCount,
      flags: ["api_error"],
      error: e instanceof Error ? e.message : "Claude request failed",
    };
  }

  const toolUse = message.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    return {
      ...base,
      status: "failed",
      page_count: pageCount,
      flags: ["no_tool_output", `stop_${message.stop_reason ?? "unknown"}`],
      error: "Claude did not return a record_extraction call",
    };
  }

  const raw = (toolUse.input ?? {}) as Record<string, unknown>;
  const fields = Object.fromEntries(
    EXTRACTION_FIELD_KEYS.map((k) => [k, coerceField(raw[k])])
  ) as Record<ExtractionFieldKey, ExtractionField>;
  const fullText =
    typeof raw.full_text === "string" ? raw.full_text.trim() : "";

  const { overall, allLow, anyBelowHigh } = summariseConfidence(fields);

  const flags: string[] = [];
  if (!fullText) flags.push("no_text");
  if (allLow) flags.push("poor_quality");
  if (anyBelowHigh) flags.push("low_confidence");

  const status: ExtractionStatus = flags.length > 0 ? "needs_review" : "extracted";

  return {
    status,
    fields,
    full_text: fullText,
    page_count: pageCount,
    overall_confidence: overall,
    flags,
    model: EXTRACTION_MODEL,
    error: null,
  };
}

// --- chunking -------------------------------------------------------------

// ~500 tokens ≈ ~2000 characters. Approximate on purpose — embeddings and a
// real tokenizer come in Phase 1b.
const CHUNK_TARGET_CHARS = 2000;
const CHUNK_MAX_CHARS = 3200;

export function chunkText(
  text: string,
  targetChars = CHUNK_TARGET_CHARS
): string[] {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (!clean) return [];

  const hardSlice = (s: string): string[] => {
    const out: string[] = [];
    for (let i = 0; i < s.length; i += CHUNK_MAX_CHARS) {
      out.push(s.slice(i, i + CHUNK_MAX_CHARS));
    }
    return out;
  };

  const paragraphs = clean.split(/\n{2,}/).flatMap((para) => {
    if (para.length <= CHUNK_MAX_CHARS) return [para];
    // Split an over-long paragraph on sentence boundaries, then hard-slice
    // anything still too big (e.g. a table with no sentence punctuation).
    const sentences = para.split(/(?<=[.!?])\s+/);
    const pieces: string[] = [];
    let buf = "";
    for (const sentence of sentences) {
      if ((buf + " " + sentence).trim().length > CHUNK_MAX_CHARS && buf) {
        pieces.push(buf.trim());
        buf = "";
      }
      buf = buf ? `${buf} ${sentence}` : sentence;
    }
    if (buf.trim()) pieces.push(buf.trim());
    return pieces.flatMap((p) =>
      p.length > CHUNK_MAX_CHARS ? hardSlice(p) : [p]
    );
  });

  const chunks: string[] = [];
  let current = "";
  for (const para of paragraphs) {
    if (current && (current.length + para.length + 2 > targetChars)) {
      chunks.push(current.trim());
      current = "";
    }
    current = current ? `${current}\n\n${para}` : para;
  }
  if (current.trim()) chunks.push(current.trim());

  return chunks;
}

// --- persistence: the webhook path --------------------------------------

function toDate(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  return Number.isNaN(Date.parse(trimmed)) ? null : trimmed;
}

function toAmount(value: string | null): number | null {
  if (!value) return null;
  const cleaned = value.replace(/[^0-9.\-]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function toCurrency(value: string | null): string | null {
  if (!value) return null;
  const code = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

function buildConfidenceJson(outcome: ExtractionOutcome) {
  const fields = outcome.fields
    ? Object.fromEntries(
        EXTRACTION_FIELD_KEYS.map((k) => [
          k,
          {
            value: outcome.fields![k].value,
            confidence: outcome.fields![k].confidence,
            ambiguity: outcome.fields![k].ambiguity,
          },
        ])
      )
    : {};

  return {
    model: outcome.model,
    page_count: outcome.page_count,
    overall_confidence: outcome.overall_confidence,
    status: outcome.status,
    flags: outcome.flags,
    error: outcome.error,
    extracted_at: new Date().toISOString(),
    fields,
  };
}

export type RunResult = {
  documentId: string;
  status: ExtractionStatus | "not_found";
  flags: string[];
  chunks: number;
  error: string | null;
};

/**
 * Orchestrates extraction for one document row: download → extract → write
 * fields, confidence and chunks back. Used by the database-webhook route.
 */
export async function runExtractionForDocument(
  documentId: string
): Promise<RunResult> {
  const supabase = createAdminClient();

  const { data: doc, error: loadErr } = await supabase
    .from("documents")
    .select(
      "id, storage_path, mime, original_filename"
    )
    .eq("id", documentId)
    .maybeSingle();

  if (loadErr || !doc) {
    return {
      documentId,
      status: "not_found",
      flags: [],
      chunks: 0,
      error: loadErr?.message ?? "document not found",
    };
  }

  await supabase
    .from("documents")
    .update({ extraction_status: "processing" })
    .eq("id", documentId);

  const download = await supabase.storage
    .from("documents")
    .download(doc.storage_path as string);

  if (download.error || !download.data) {
    const patch = {
      extraction_status: "failed" as const,
      extraction_confidence: {
        model: EXTRACTION_MODEL,
        status: "failed",
        flags: ["download_failed"],
        error: download.error?.message ?? "could not download file",
        extracted_at: new Date().toISOString(),
        fields: {},
      },
    };
    await supabase.from("documents").update(patch).eq("id", documentId);
    return {
      documentId,
      status: "failed",
      flags: ["download_failed"],
      chunks: 0,
      error: patch.extraction_confidence.error,
    };
  }

  const bytes = new Uint8Array(await download.data.arrayBuffer());
  const outcome = await extractDocument({
    bytes,
    mime: (doc.mime as string | null) ?? "",
    filename: (doc.original_filename as string) ?? "document",
  });

  const patch: Record<string, unknown> = {
    extraction_status: outcome.status,
    extraction_confidence: buildConfidenceJson(outcome),
  };

  if (outcome.fields) {
    const f = outcome.fields;
    patch.doc_type = f.document_type.value;
    patch.provider = f.provider.value;
    patch.reference = f.reference.value;
    patch.start_date = toDate(f.start_date.value);
    patch.end_date = toDate(f.end_date.value);
    patch.renewal_date = toDate(f.renewal_date.value);
    patch.amount = toAmount(f.amount.value);
    patch.currency = toCurrency(f.currency.value);
    patch.key_contact_name = f.key_contact_name.value;
    patch.key_contact_phone = f.key_contact_phone.value;
  }

  await supabase.from("documents").update(patch).eq("id", documentId);

  // Replace any previous chunks for this document.
  await supabase.from("document_chunks").delete().eq("document_id", documentId);
  const chunks = chunkText(outcome.full_text);
  if (chunks.length > 0) {
    await supabase.from("document_chunks").insert(
      chunks.map((content, chunk_index) => ({
        document_id: documentId,
        chunk_index,
        content,
      }))
    );
  }

  // Whatever dates came off the page are now schedulable. A reminder is a
  // nice-to-have on top of a finished extraction, so a failure here is logged
  // and dropped rather than reported as an extraction failure.
  try {
    await syncRemindersForDocument(documentId);
  } catch (e) {
    console.error(`[reminders] sync after extraction failed for ${documentId}`, e);
  }

  return {
    documentId,
    status: outcome.status,
    flags: outcome.flags,
    chunks: chunks.length,
    error: outcome.error,
  };
}
