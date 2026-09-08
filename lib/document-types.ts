// Shared (client-safe) shapes for documents and their extraction metadata.

export type Confidence = "high" | "medium" | "low";

export type ExtractionFieldMeta = {
  value: string | null;
  confidence: Confidence;
  ambiguity: string | null;
};

export type ExtractionConfidence = {
  model?: string;
  page_count?: number | null;
  overall_confidence?: Confidence | null;
  status?: string;
  flags?: string[];
  error?: string | null;
  extracted_at?: string;
  fields?: Record<string, ExtractionFieldMeta>;
};

export type DocumentRow = {
  id: string;
  original_filename: string;
  created_at: string;
  extraction_status: string;
  doc_type: string | null;
  provider: string | null;
  reference: string | null;
  start_date: string | null;
  end_date: string | null;
  renewal_date: string | null;
  amount: number | string | null;
  currency: string | null;
  key_contact_name: string | null;
  key_contact_phone: string | null;
  extraction_confidence: ExtractionConfidence | null;
};

export const DOCUMENTS_SELECT =
  "id, original_filename, created_at, extraction_status, doc_type, provider, reference, start_date, end_date, renewal_date, amount, currency, key_contact_name, key_contact_phone, extraction_confidence";

// Column name in `documents` <- extraction field key. Order is the review-form order.
export const REVIEW_FIELDS: {
  key: string; // form field name (matches the extraction schema key)
  column: keyof DocumentRow;
  label: string;
  type: "text" | "date" | "amount";
}[] = [
  { key: "document_type", column: "doc_type", label: "Document type", type: "text" },
  { key: "provider", column: "provider", label: "Provider", type: "text" },
  { key: "reference", column: "reference", label: "Reference", type: "text" },
  { key: "start_date", column: "start_date", label: "Start date", type: "date" },
  { key: "end_date", column: "end_date", label: "End date", type: "date" },
  { key: "renewal_date", column: "renewal_date", label: "Renewal date", type: "date" },
  { key: "amount", column: "amount", label: "Amount", type: "amount" },
  { key: "currency", column: "currency", label: "Currency", type: "text" },
  { key: "key_contact_name", column: "key_contact_name", label: "Contact name", type: "text" },
  { key: "key_contact_phone", column: "key_contact_phone", label: "Contact phone", type: "text" },
];
