"use client";

import { useActionState, useState } from "react";
import {
  clearPersonDayStatus,
  savePersonDayStatus,
  type WhosWhereState,
} from "@/app/actions/whos-where";
import { Button } from "@/components/ui";
import type { HouseholdPerson } from "@/lib/family";
import { STATUS_SUGGESTIONS } from "@/lib/whos-where";

export default function WhosWhereEditor({
  people,
  statuses,
  statusDate,
}: {
  people: HouseholdPerson[];
  statuses: Record<string, string>;
  statusDate: string;
}) {
  return (
    <ul className="divide-y divide-rule">
      {people.map((person) => (
        <PersonStatusRow
          key={`${person.id}:${statuses[person.id] ?? ""}`}
          person={person}
          status={statuses[person.id] ?? ""}
          statusDate={statusDate}
        />
      ))}
    </ul>
  );
}

function PersonStatusRow({
  person,
  status,
  statusDate,
}: {
  person: HouseholdPerson;
  status: string;
  statusDate: string;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(status);
  const [state, submit, pending] = useActionState<WhosWhereState, FormData>(
    savePersonDayStatus,
    undefined
  );
  const [clearState, clearSubmit, clearPending] = useActionState<
    WhosWhereState,
    FormData
  >(clearPersonDayStatus, undefined);

  const saved = Boolean(state?.ok || clearState?.ok);
  const showEditor = editing && !saved;

  return (
    <li className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
      <span
        aria-hidden
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-tint text-xs font-semibold text-sky"
      >
        {person.name.trim()[0]?.toUpperCase() ?? "?"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{person.name}</p>
        {showEditor ? (
          <>
            <form action={submit} className="mt-1.5 flex flex-col gap-2">
              <input type="hidden" name="person_id" value={person.id} />
              <input type="hidden" name="status_date" value={statusDate} />
              <input
                name="status_text"
                className="field-input"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="At school, WFH, club…"
                required
              />
              <div className="flex flex-wrap gap-1.5">
                {STATUS_SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="rounded-pill border border-rule px-2 py-0.5 text-xs text-ink-soft"
                    onClick={() => setValue(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
              {(state?.error || clearState?.error) && (
                <p className="text-sm text-oxblood">
                  {state?.error || clearState?.error}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={pending}>
                  {pending ? "Saving…" : "Save"}
                </Button>
                <Button
                  type="button"
                  variant="quiet"
                  onClick={() => setEditing(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
            {status ? (
              <form action={clearSubmit} className="mt-1">
                <input type="hidden" name="person_id" value={person.id} />
                <input type="hidden" name="status_date" value={statusDate} />
                <button
                  type="submit"
                  className="text-xs text-oxblood"
                  disabled={clearPending}
                >
                  Clear
                </button>
              </form>
            ) : null}
          </>
        ) : (
          <button
            type="button"
            className="text-left text-xs text-ink-soft"
            onClick={() => {
              setValue(status);
              setEditing(true);
            }}
          >
            {status || "Tap to set where they are"}
          </button>
        )}
      </div>
    </li>
  );
}
