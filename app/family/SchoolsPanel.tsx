"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import {
  deleteSchool,
  saveSchool,
  type FamilyState,
} from "@/app/actions/family";
import { Button, Field } from "@/components/ui";
import type { HouseholdPerson, School } from "@/lib/family";

type Props = {
  schools: School[];
  people: HouseholdPerson[];
};

/** "Ada", "Ada and Sam", "Ada, Sam and Ida". */
function listNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export default function SchoolsPanel({ schools, people }: Props) {
  const [adding, setAdding] = useState(false);
  const stopAdding = useCallback(() => setAdding(false), []);

  return (
    <div className="flex flex-col gap-4">
      {schools.length === 0 ? (
        <p className="text-sm text-ink-faint">
          No schools yet. Add one and you can put each child in it.
        </p>
      ) : (
        <ul className="divide-y divide-rule">
          {schools.map((school) => (
            <SchoolRow
              key={school.id}
              school={school}
              attending={people.filter(
                (person) => person.school_id === school.id
              )}
            />
          ))}
        </ul>
      )}

      <div className="border-t border-rule pt-4">
        {adding ? (
          <SchoolForm onDone={stopAdding} />
        ) : (
          <Button type="button" variant="quiet" onClick={() => setAdding(true)}>
            Add a school
          </Button>
        )}
      </div>
    </div>
  );
}

function SchoolRow({
  school,
  attending,
}: {
  school: School;
  attending: HouseholdPerson[];
}) {
  const [editing, setEditing] = useState(false);
  const stopEditing = useCallback(() => setEditing(false), []);

  const who = listNames(
    attending.map((person) =>
      [person.name, person.year_group].filter(Boolean).join(", ")
    )
  );

  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{school.name}</p>
          <p className="text-xs text-ink-faint">
            {who || "Nobody at it yet"}
          </p>
          {school.address ? (
            <p className="mt-0.5 whitespace-pre-line text-xs text-ink-soft">
              {school.address}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setEditing((open) => !open)}
          className="text-action shrink-0 text-sm"
        >
          {editing ? "Close" : "Edit"}
        </button>
      </div>

      {editing ? (
        <div className="mt-3 rounded-lg bg-paper-sunk p-3">
          <SchoolForm school={school} onDone={stopEditing} />
          <RemoveSchool school={school} attending={attending.length} />
        </div>
      ) : null}
    </li>
  );
}

function SchoolForm({
  school,
  onDone,
}: {
  school?: School;
  onDone: () => void;
}) {
  const [state, submit, pending] = useActionState<FamilyState, FormData>(
    saveSchool,
    undefined
  );

  useEffect(() => {
    if (state?.ok) onDone();
  }, [state?.ok, onDone]);

  return (
    <form action={submit} className="flex flex-col gap-3">
      {school ? (
        <input type="hidden" name="school_id" value={school.id} />
      ) : null}

      <Field label="School name">
        <input
          name="name"
          type="text"
          required
          defaultValue={school?.name ?? ""}
          className="field-input"
          placeholder="St Mary’s Primary"
        />
      </Field>

      <Field label="Address" hint="optional">
        <textarea
          name="address"
          rows={2}
          defaultValue={school?.address ?? ""}
          className="field-input"
          placeholder="School Lane, Town"
        />
      </Field>

      <Field label="Anything worth noting" hint="optional">
        <textarea
          name="notes"
          rows={2}
          defaultValue={school?.notes ?? ""}
          className="field-input"
          placeholder="Office hours, who to ring about absences"
        />
      </Field>

      {state?.error ? (
        <p className="text-sm mark-fault">{state.error}</p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : school ? "Save" : "Add it"}
        </Button>
        <button type="button" onClick={onDone} className="text-action text-sm">
          Cancel
        </button>
      </div>
    </form>
  );
}

function RemoveSchool({
  school,
  attending,
}: {
  school: School;
  attending: number;
}) {
  const [state, submit, pending] = useActionState<FamilyState, FormData>(
    deleteSchool,
    undefined
  );
  const [confirming, setConfirming] = useState(false);

  return (
    <form
      action={submit}
      className="mt-3 flex items-center justify-between gap-3 border-t border-rule pt-3"
    >
      <input type="hidden" name="school_id" value={school.id} />
      <p className={`text-xs ${state?.error ? "mark-fault" : "text-ink-faint"}`}>
        {state?.error ??
          (confirming
            ? "Remove this school?"
            : attending > 0
              ? `${attending} ${
                  attending === 1 ? "child stays" : "children stay"
                }, just without a school.`
              : "Nothing else is attached to it.")}
      </p>
      {confirming ? (
        <button
          type="submit"
          disabled={pending}
          className="text-action mark-fault shrink-0 text-sm"
        >
          {pending ? "Removing…" : "Yes, remove"}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="text-action shrink-0 text-sm"
        >
          Remove
        </button>
      )}
    </form>
  );
}
