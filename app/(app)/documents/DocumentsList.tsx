"use client";

import { useActionState, useState } from "react";
import {
  confirmExtraction,
  reprocessDocument,
  type ReviewState,
} from "@/app/actions/documents";
import {
  asCategory,
  categorise,
  CATEGORIES,
  effectiveCategory,
} from "@/lib/categories";
import {
  REVIEW_FIELDS,
  type DocumentRow,
  type ExtractionConfidence,
} from "@/lib/document-types";
import { CATEGORY_ICON } from "@/components/category-icons";
import CopyButton from "@/components/CopyButton";
import RenewalEditSheet from "@/components/RenewalEditSheet";
import {
  Button,
  ConfidencePill,
  StatusMark,
  statusEdgeClass,
} from "@/components/ui";
import { formatDate as formatLocaleDate } from "@/lib/dates";
import type { HouseholdPerson } from "@/lib/family";
import type { Locale } from "@/lib/household";
import {
  documentRenewalDue,
  draftFromKind,
  inferRenewalKindFromDocument,
  renewalStatusLabel,
  type RenewalItem,
} from "@/lib/renewals";

const MONTHS = [
  "January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December",
];

// Deterministic (locale-independent) so server and client markup match.
function formatDate(iso: string, short = false): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const month = MONTHS[d.getUTCMonth()];
  return short
    ? `${d.getUTCDate()} ${month.slice(0, 3)} ${d.getUTCFullYear()}`
    : `${d.getUTCDate()} ${month} ${d.getUTCFullYear()}`;
}

function summaryLine(conf: ExtractionConfidence | null): string {
  if (!conf) return "";
  const parts: string[] = [];
  if (conf.extracted_at) parts.push(`Read on ${formatDate(conf.extracted_at)}.`);
  if (conf.page_count) {
    parts.push(`${conf.page_count} ${conf.page_count === 1 ? "page" : "pages"}.`);
  }
  if (conf.overall_confidence) {
    parts.push(`Overall confidence: ${conf.overall_confidence}.`);
  }
  const flags = conf.flags ?? [];
  if (flags.includes("long_document")) {
    parts.push("It’s a long scan, so please check it carefully.");
  } else if (flags.includes("poor_quality")) {
    parts.push("The scan was hard to read in places.");
  }
  return parts.join(" ");
}

function initialValue(doc: DocumentRow, column: keyof DocumentRow): string {
  const v = doc[column];
  return v === null || v === undefined ? "" : String(v);
}

function isReferenceLikeField(key: string, label: string): boolean {
  const hay = `${key} ${label}`.toLowerCase();
  return /reference|policy|plan|account|member|membership/.test(hay);
}

function ReviewForm({ doc }: { doc: DocumentRow }) {
  const [state, submit, pending] = useActionState<ReviewState, FormData>(
    confirmExtraction,
    undefined
  );
  const fieldMeta = doc.extraction_confidence?.fields ?? {};
  const confirmed = doc.extraction_status === "confirmed";

  return (
    <form action={submit} className="mt-4 flex flex-col gap-4">
      <input type="hidden" name="document_id" value={doc.id} />

      <label className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-ink-soft">File it under</span>
        <select
          name="category"
          defaultValue={effectiveCategory(doc)}
          className="field-input w-auto"
        >
          <option value="">Let us sort it</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
        {REVIEW_FIELDS.map((f) => {
          const meta = fieldMeta[f.key];
          return (
            <label key={f.key} className="flex flex-col gap-1.5">
              <span className="flex items-center gap-2 text-sm text-ink-soft">
                {f.label}
                {meta ? <ConfidencePill level={meta.confidence} /> : null}
              </span>
              <div className="flex items-center gap-1">
                <input
                  name={f.key}
                  type="text"
                  inputMode={f.type === "amount" ? "decimal" : undefined}
                  placeholder={f.type === "date" ? "YYYY-MM-DD" : undefined}
                  defaultValue={initialValue(doc, f.column)}
                  className={`field-input min-w-0 flex-1 ${f.type === "amount" || f.type === "date" ? "tnum" : ""}`}
                />
                {isReferenceLikeField(f.key, f.label) &&
                initialValue(doc, f.column) ? (
                  <CopyButton value={initialValue(doc, f.column)} />
                ) : null}
              </div>
              {meta?.ambiguity ? (
                <span className="margin-note">{meta.ambiguity}</span>
              ) : null}
            </label>
          );
        })}
      </div>

      {state?.error ? (
        <p className="text-sm mark-fault">{state.error}</p>
      ) : null}
      {state?.ok ? (
        <p className="text-sm mark-filed">Saved and filed.</p>
      ) : null}

      <div>
        <Button type="submit" disabled={pending}>
          {pending
            ? "Saving…"
            : confirmed
              ? "Save changes"
              : "Confirm and file"}
        </Button>
      </div>
    </form>
  );
}

function ReprocessAction({ doc }: { doc: DocumentRow }) {
  const [state, submit, pending] = useActionState<ReviewState, FormData>(
    reprocessDocument,
    undefined
  );
  return (
    <form action={submit} className="mt-3 flex flex-col gap-1.5">
      <input type="hidden" name="document_id" value={doc.id} />
      <button type="submit" disabled={pending} className="text-action text-sm">
        {pending ? "Reading it again…" : "Read it again"}
      </button>
      {state?.error ? (
        <p className="text-sm mark-fault">{state.error}</p>
      ) : null}
    </form>
  );
}

type DocOption = Pick<DocumentRow, "id" | "original_filename" | "category">;

function Entry({
  doc,
  linkedRenewal,
  people,
  docOptions,
  locale,
}: {
  doc: DocumentRow;
  linkedRenewal?: RenewalItem;
  people: HouseholdPerson[];
  docOptions: DocOption[];
  locale: Locale;
}) {
  const [open, setOpen] = useState(
    doc.extraction_status === "needs_review" ||
      doc.extraction_status === "extracted"
  );
  const conf = doc.extraction_confidence;
  const reviewable = ["extracted", "needs_review", "confirmed"].includes(
    doc.extraction_status
  );
  const inProgress =
    doc.extraction_status === "pending" ||
    doc.extraction_status === "processing";
  // The stored bucket if there is one; otherwise the guess, but only once
  // there is something to guess from.
  const shownCategory =
    asCategory(doc.category) ?? (reviewable ? categorise(doc) : null);
  const CategoryIcon = shownCategory ? CATEGORY_ICON[shownCategory] : null;
  const renewalDue = documentRenewalDue(doc);
  const [trackOpen, setTrackOpen] = useState(false);
  const trackDraft = renewalDue
    ? draftFromKind(inferRenewalKindFromDocument(doc), { document: doc })
    : null;

  return (
    <li className={`entry ${statusEdgeClass(doc.extraction_status)}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 px-4 py-3.5 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base text-ink">
            {doc.original_filename}
          </span>
          {reviewable && doc.provider ? (
            <span className="mt-0.5 block truncate text-sm text-ink-soft">
              {doc.provider}
            </span>
          ) : null}
          {shownCategory && CategoryIcon ? (
            <span className="mt-1 flex items-center gap-1.5 text-xs text-ink-faint">
              <CategoryIcon size={13} strokeWidth={1.9} aria-hidden />
              <span className="truncate">{shownCategory}</span>
            </span>
          ) : null}
        </span>
        <span className="flex shrink-0 flex-col items-end gap-0.5 pt-0.5">
          <span className="tnum text-xs text-ink-faint">
            {formatDate(doc.created_at, true)}
          </span>
          <StatusMark status={doc.extraction_status} />
        </span>
        <svg
          viewBox="0 0 12 12"
          width="12"
          height="12"
          aria-hidden
          className={`mt-1 shrink-0 text-ink-faint transition-transform ${
            open ? "rotate-90" : ""
          }`}
        >
          <path
            d="M4 2l4 4-4 4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open ? (
        <div className="border-t border-rule bg-paper-sunk px-4 py-4">
          {inProgress && (
            <p className="text-sm text-ink-soft">
              We’re reading this now. It’ll be ready to check shortly.
            </p>
          )}

          {doc.extraction_status === "failed" && (
            <div>
              <p className="text-sm text-ink">
                We couldn’t read this one
                {conf?.error ? (
                  <span className="text-ink-soft"> — {conf.error}</span>
                ) : null}
                .
              </p>
              <ReprocessAction doc={doc} />
            </div>
          )}

          {reviewable && (
            <div>
              {summaryLine(conf) ? (
                <p className="text-sm text-ink-soft">{summaryLine(conf)}</p>
              ) : null}
              {renewalDue ? (
                <div className="mb-3">
                  {linkedRenewal ? (
                    <p className="text-sm text-ink-soft">
                      Tracked · {renewalStatusLabel(linkedRenewal)}{" "}
                      {linkedRenewal.due_date
                        ? `· ${formatLocaleDate(linkedRenewal.due_date, locale)}`
                        : ""}
                    </p>
                  ) : (
                    <button
                      type="button"
                      className="text-action text-sm"
                      onClick={() => setTrackOpen(true)}
                    >
                      Track renewal
                    </button>
                  )}
                </div>
              ) : null}
              <ReviewForm doc={doc} />
              {doc.extraction_status !== "confirmed" && (
                <ReprocessAction doc={doc} />
              )}
            </div>
          )}
        </div>
      ) : null}

      {trackDraft ? (
        <RenewalEditSheet
          open={trackOpen}
          onClose={() => setTrackOpen(false)}
          draft={trackDraft}
          people={people}
          documents={docOptions}
          locale={locale}
        />
      ) : null}
    </li>
  );
}

export default function DocumentsList({
  documents,
  renewalByDocument,
  people,
  docOptions,
  locale,
}: {
  documents: DocumentRow[];
  renewalByDocument: Map<string, RenewalItem>;
  people: HouseholdPerson[];
  docOptions: DocOption[];
  locale: Locale;
}) {
  return (
    <ul>
      {documents.map((doc) => (
        <Entry
          key={doc.id}
          doc={doc}
          linkedRenewal={renewalByDocument.get(doc.id)}
          people={people}
          docOptions={docOptions}
          locale={locale}
        />
      ))}
    </ul>
  );
}
