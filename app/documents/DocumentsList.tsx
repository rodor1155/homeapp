"use client";

import { useActionState, useState } from "react";
import {
  confirmExtraction,
  reprocessDocument,
  type ReviewState,
} from "@/app/actions/documents";
import {
  REVIEW_FIELDS,
  type Confidence,
  type DocumentRow,
} from "@/lib/document-types";

const inputCls =
  "w-full rounded-md border border-black/15 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50";
const btnPrimary =
  "rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background disabled:opacity-50";
const btnGhost =
  "rounded-md border border-black/15 px-3 py-1.5 text-sm font-medium hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/5";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Deterministic (locale-independent) so server and client markup match.
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

const STATUS_STYLE: Record<string, string> = {
  pending: "opacity-60",
  processing: "opacity-60",
  extracted: "text-blue-700 dark:text-blue-300",
  needs_review: "text-amber-700 dark:text-amber-300",
  confirmed: "text-green-700 dark:text-green-300",
  failed: "text-red-700 dark:text-red-300",
};

const CONF_STYLE: Record<Confidence, string> = {
  high: "border-green-600/40 text-green-700 dark:text-green-300",
  medium: "border-amber-600/40 text-amber-700 dark:text-amber-300",
  low: "border-red-600/40 text-red-700 dark:text-red-300",
};

function ConfidencePill({ c }: { c: Confidence }) {
  return (
    <span
      className={`rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${CONF_STYLE[c]}`}
    >
      {c}
    </span>
  );
}

function initialValue(doc: DocumentRow, column: keyof DocumentRow): string {
  const v = doc[column];
  if (v === null || v === undefined) return "";
  return String(v);
}

function ReviewForm({ doc }: { doc: DocumentRow }) {
  const [state, submit, pending] = useActionState<ReviewState, FormData>(
    confirmExtraction,
    undefined
  );
  const fieldMeta = doc.extraction_confidence?.fields ?? {};

  return (
    <form action={submit} className="mt-3 flex flex-col gap-3">
      <input type="hidden" name="document_id" value={doc.id} />
      <div className="grid gap-3 sm:grid-cols-2">
        {REVIEW_FIELDS.map((f) => {
          const meta = fieldMeta[f.key];
          return (
            <label key={f.key} className="flex flex-col gap-1 text-sm">
              <span className="flex items-center gap-2">
                {f.label}
                {meta ? <ConfidencePill c={meta.confidence} /> : null}
              </span>
              <input
                name={f.key}
                type={f.type === "date" ? "text" : "text"}
                inputMode={f.type === "amount" ? "decimal" : undefined}
                placeholder={f.type === "date" ? "YYYY-MM-DD" : undefined}
                defaultValue={initialValue(doc, f.column)}
                className={inputCls}
              />
              {meta?.ambiguity ? (
                <span className="text-xs text-amber-700 dark:text-amber-300">
                  ⚠ {meta.ambiguity}
                </span>
              ) : null}
            </label>
          );
        })}
      </div>

      {state?.error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      ) : null}
      {state?.ok ? (
        <p className="text-sm text-green-700 dark:text-green-400">Saved.</p>
      ) : null}

      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className={btnPrimary}>
          {pending
            ? "Saving…"
            : doc.extraction_status === "confirmed"
              ? "Save changes"
              : "Confirm"}
        </button>
      </div>
    </form>
  );
}

function ReprocessButton({ doc }: { doc: DocumentRow }) {
  const [state, submit, pending] = useActionState<ReviewState, FormData>(
    reprocessDocument,
    undefined
  );
  return (
    <form action={submit} className="mt-2 flex flex-col gap-2">
      <input type="hidden" name="document_id" value={doc.id} />
      <div>
        <button type="submit" disabled={pending} className={btnGhost}>
          {pending ? "Re-running…" : "Re-run extraction"}
        </button>
      </div>
      {state?.error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      ) : null}
    </form>
  );
}

function DocumentCard({ doc }: { doc: DocumentRow }) {
  const [open, setOpen] = useState(
    doc.extraction_status === "needs_review" ||
      doc.extraction_status === "extracted"
  );
  const conf = doc.extraction_confidence;
  const flags = conf?.flags ?? [];
  const reviewable = ["extracted", "needs_review", "confirmed"].includes(
    doc.extraction_status
  );

  return (
    <li className="px-4 py-3">
      <div className="flex items-center justify-between gap-3 text-sm">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="min-w-0 flex-1 truncate text-left hover:underline"
        >
          {doc.original_filename}
        </button>
        <span className="shrink-0 opacity-60">{formatDate(doc.created_at)}</span>
        <span
          className={`shrink-0 text-xs font-medium capitalize ${
            STATUS_STYLE[doc.extraction_status] ?? "opacity-70"
          }`}
        >
          {doc.extraction_status.replace("_", " ")}
        </span>
      </div>

      {open ? (
        <div className="mt-1">
          {(doc.extraction_status === "pending" ||
            doc.extraction_status === "processing") && (
            <p className="text-sm opacity-60">Extraction in progress…</p>
          )}

          {doc.extraction_status === "failed" && (
            <div className="text-sm">
              <p className="text-red-600 dark:text-red-400">
                Extraction failed{conf?.error ? `: ${conf.error}` : ""}.
              </p>
              <ReprocessButton doc={doc} />
            </div>
          )}

          {reviewable && (
            <>
              {flags.length > 0 && (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  Flags: {flags.join(", ")}
                  {conf?.overall_confidence
                    ? ` · overall ${conf.overall_confidence}`
                    : ""}
                  {conf?.page_count ? ` · ${conf.page_count} pages` : ""}
                </p>
              )}
              <ReviewForm doc={doc} />
              {doc.extraction_status !== "confirmed" && (
                <ReprocessButton doc={doc} />
              )}
            </>
          )}
        </div>
      ) : null}
    </li>
  );
}

export default function DocumentsList({
  documents,
}: {
  documents: DocumentRow[];
}) {
  return (
    <ul className="divide-y divide-black/10 rounded-lg border border-black/10 dark:divide-white/10 dark:border-white/15">
      {documents.map((doc) => (
        <DocumentCard key={doc.id} doc={doc} />
      ))}
    </ul>
  );
}
