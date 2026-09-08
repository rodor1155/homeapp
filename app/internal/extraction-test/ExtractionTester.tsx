"use client";

import { useActionState } from "react";
import {
  runTestExtraction,
  type TestExtractionState,
} from "@/app/actions/extraction-test";

const FIELD_ORDER = [
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

export default function ExtractionTester() {
  const [state, submit, pending] = useActionState<TestExtractionState, FormData>(
    runTestExtraction,
    undefined
  );

  const outcome = state?.outcome;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-4 py-12">
      <div>
        <h1 className="text-xl font-semibold">Extraction test</h1>
        <p className="mt-1 text-sm opacity-70">
          Internal benchmark harness. Runs {`“`}record_extraction{`”`} on
          one file — no Storage, no database, no household. Model:{" "}
          <code>claude-sonnet-4-6</code>.
        </p>
      </div>

      <form action={submit} className="flex flex-col gap-3">
        <input
          type="file"
          name="file"
          accept="application/pdf,image/*"
          required
          className="text-sm"
        />
        <div>
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper-raised disabled:opacity-50"
          >
            {pending ? "Extracting…" : "Run extraction"}
          </button>
        </div>
      </form>

      {state?.error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      ) : null}

      {outcome ? (
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-black/10 p-4 text-sm dark:border-white/15">
            <p>
              <strong>{state?.filename}</strong>
            </p>
            <p className="opacity-70">
              status <code>{outcome.status}</code> · overall{" "}
              <code>{outcome.overall_confidence ?? "—"}</code> · pages{" "}
              <code>{outcome.page_count ?? "?"}</code> · model{" "}
              <code>{outcome.model}</code>
            </p>
            {outcome.flags.length > 0 ? (
              <p className="mt-1 text-amber-700 dark:text-amber-300">
                flags: {outcome.flags.join(", ")}
              </p>
            ) : null}
            {outcome.error ? (
              <p className="mt-1 text-red-600 dark:text-red-400">
                {outcome.error}
              </p>
            ) : null}
          </div>

          {outcome.fields ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-black/15 text-left dark:border-white/20">
                    <th className="py-2 pr-4">Field</th>
                    <th className="py-2 pr-4">Value</th>
                    <th className="py-2 pr-4">Confidence</th>
                    <th className="py-2">Ambiguity</th>
                  </tr>
                </thead>
                <tbody>
                  {FIELD_ORDER.map((key) => {
                    const f = outcome.fields![key];
                    return (
                      <tr
                        key={key}
                        className="border-b border-black/5 align-top dark:border-white/10"
                      >
                        <td className="py-2 pr-4 font-mono text-xs">{key}</td>
                        <td className="py-2 pr-4">{f.value ?? "—"}</td>
                        <td className="py-2 pr-4">{f.confidence}</td>
                        <td className="py-2 text-amber-700 dark:text-amber-300">
                          {f.ambiguity ?? ""}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}

          <details className="rounded-lg border border-black/10 p-4 text-sm dark:border-white/15">
            <summary className="cursor-pointer font-medium">
              Raw outcome JSON
            </summary>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs">
              {JSON.stringify(outcome, null, 2)}
            </pre>
          </details>

          {outcome.full_text ? (
            <details className="rounded-lg border border-black/10 p-4 text-sm dark:border-white/15">
              <summary className="cursor-pointer font-medium">
                Transcribed text ({outcome.full_text.length} chars)
              </summary>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs">
                {outcome.full_text}
              </pre>
            </details>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}
