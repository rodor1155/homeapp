"use client";

import { useMemo, useState, useTransition } from "react";
import {
  dismissGmailCandidate,
  importGmailCandidates,
  type GmailActionState,
} from "@/app/actions/gmail";
import { CATEGORIES, type Category } from "@/lib/categories";
import { intlLocale } from "@/lib/dates";
import { Button } from "@/components/ui";

function formatReceivedAt(iso: string, locale: "UK" | "US"): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export type GmailCandidate = {
  id: string;
  filename: string;
  subject: string | null;
  sender: string | null;
  received_at: string | null;
  suggested_category: string | null;
};

export default function GmailImportReview({
  candidates: initial,
  locale,
  onBack,
  onImported,
}: {
  candidates: GmailCandidate[];
  locale: "UK" | "US";
  onBack: () => void;
  onImported: () => void;
}) {
  const [candidates, setCandidates] = useState(initial);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initial.map((c) => c.id))
  );
  const [categories, setCategories] = useState<Record<string, Category>>(() => {
    const map: Record<string, Category> = {};
    for (const c of initial) {
      const cat = c.suggested_category;
      map[c.id] =
        cat && (CATEGORIES as readonly string[]).includes(cat)
          ? (cat as Category)
          : "Other";
    }
    return map;
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const allSelected = useMemo(
    () => candidates.length > 0 && selected.size === candidates.length,
    [candidates.length, selected.size]
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(candidates.map((c) => c.id)));
  }

  function runImport() {
    setError(null);
    startTransition(async () => {
      const ids = [...selected];
      const result: GmailActionState & { imported?: number } =
        await importGmailCandidates(ids, categories);
      if (result.error) {
        setError(result.error);
        return;
      }
      onImported();
    });
  }

  function dismissOne(id: string) {
    startTransition(async () => {
      const result = await dismissGmailCandidate(id);
      if (result.error) {
        setError(result.error);
        return;
      }
      setCandidates((rows) => rows.filter((r) => r.id !== id));
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    });
  }

  if (candidates.length === 0) {
    return (
      <div className="flex flex-col gap-4 pb-2 text-center">
        <p className="text-sm text-ink-soft">
          No PDFs waiting to import. Try scanning Gmail again after new post
          arrives.
        </p>
        <Button type="button" variant="quiet" onClick={onBack} className="w-full">
          Back
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-2">
      <p className="text-sm text-ink-soft">
        Tick what to bring into your house file. Nothing is stored until you
        confirm.
      </p>

      <label className="flex items-center gap-2 text-sm text-ink-soft">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={toggleAll}
          className="h-4 w-4 rounded border-rule-strong"
        />
        Select all ({candidates.length})
      </label>

      <ul className="flex flex-col gap-2">
        {candidates.map((candidate) => {
          const checked = selected.has(candidate.id);
          return (
            <li
              key={candidate.id}
              className={`rounded-lg border px-3 py-3 ${
                checked ? "border-sage-soft bg-sage-tint/40" : "border-rule bg-paper"
              }`}
            >
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(candidate.id)}
                  className="mt-1 h-4 w-4 rounded border-rule-strong"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-ink">
                    {candidate.filename}
                  </span>
                  {candidate.subject ? (
                    <span className="mt-0.5 block truncate text-xs text-ink-soft">
                      {candidate.subject}
                    </span>
                  ) : null}
                  <span className="mt-1 block text-xs text-ink-faint">
                    {candidate.received_at
                      ? formatReceivedAt(candidate.received_at, locale)
                      : "Date unknown"}
                    {candidate.sender ? ` · ${candidate.sender}` : ""}
                  </span>
                </span>
              </label>
              <div className="mt-2 flex flex-wrap items-center gap-2 pl-7">
                <label className="flex items-center gap-2 text-xs text-ink-soft">
                  File under
                  <select
                    value={categories[candidate.id] ?? "Other"}
                    onChange={(e) =>
                      setCategories((prev) => ({
                        ...prev,
                        [candidate.id]: e.target.value as Category,
                      }))
                    }
                    className="field-input w-auto py-1 text-xs"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => dismissOne(candidate.id)}
                  className="text-action text-xs"
                >
                  Dismiss
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {error ? <p className="text-xs mark-fault">{error}</p> : null}

      <Button
        type="button"
        disabled={pending || selected.size === 0}
        onClick={runImport}
        className="w-full"
      >
        {pending
          ? "Importing…"
          : `Import ${selected.size} ${selected.size === 1 ? "document" : "documents"}`}
      </Button>
      <Button type="button" variant="quiet" onClick={onBack} className="w-full">
        Back
      </Button>
    </div>
  );
}
