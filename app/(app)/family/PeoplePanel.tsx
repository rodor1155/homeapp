"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import {
  deletePerson,
  savePerson,
  type FamilyState,
} from "@/app/actions/family";
import { Button, Field } from "@/components/ui";
import { formatDate, relativeWhen } from "@/lib/dates";
import {
  isSchoolYear,
  nextBirthday,
  personSummary,
  PERSON_KINDS,
  PERSON_KIND_LABEL,
  PERSON_RELATIONS,
  PERSON_RELATION_LABEL,
  SCHOOL_YEARS,
  type HouseholdPerson,
  type PersonKind,
  type School,
} from "@/lib/family";
import type { Locale } from "@/lib/household";

type Props = {
  people: HouseholdPerson[];
  schools: School[];
  locale: Locale;
};

export default function PeoplePanel({ people, schools, locale }: Props) {
  const [adding, setAdding] = useState(false);
  const stopAdding = useCallback(() => setAdding(false), []);

  return (
    <div className="flex flex-col gap-4">
      {people.length === 0 ? (
        <p className="text-sm text-ink-faint">
          Nobody here yet. Add yourself, whoever you live with, and the
          children — birthdays and schools hang off these.
        </p>
      ) : (
        <ul className="divide-y divide-rule">
          {people.map((person) => (
            <PersonRow
              key={person.id}
              person={person}
              schools={schools}
              locale={locale}
            />
          ))}
        </ul>
      )}

      <div className="border-t border-rule pt-4">
        {adding ? (
          <PersonForm schools={schools} onDone={stopAdding} />
        ) : (
          <Button type="button" variant="quiet" onClick={() => setAdding(true)}>
            Add someone
          </Button>
        )}
      </div>
    </div>
  );
}

function PersonRow({
  person,
  schools,
  locale,
}: {
  person: HouseholdPerson;
  schools: School[];
  locale: Locale;
}) {
  const [editing, setEditing] = useState(false);
  const stopEditing = useCallback(() => setEditing(false), []);

  const school = schools.find((s) => s.id === person.school_id) ?? null;
  const birthday = nextBirthday(person.birthday);
  // "Daughter · St Mary’s · Year 5" — the relation stands in for the kind
  // whenever there is one.
  const meta = personSummary(person, school?.name);

  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sage-tint text-sm font-semibold text-sage"
        >
          {person.name.trim()[0]?.toUpperCase() ?? "?"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{person.name}</p>
          <p className="truncate text-xs text-ink-faint">{meta}</p>
          {birthday ? (
            <p className="tnum mt-0.5 text-xs text-ink-soft">
              Turns {birthday.turning} on {formatDate(birthday.date, locale)} ·{" "}
              {relativeWhen(birthday.daysAway)}
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
          <PersonForm
            person={person}
            schools={schools}
            onDone={stopEditing}
          />
          <RemovePerson person={person} />
        </div>
      ) : null}
    </li>
  );
}

function PersonForm({
  person,
  schools,
  onDone,
}: {
  person?: HouseholdPerson;
  schools: School[];
  onDone: () => void;
}) {
  const [state, submit, pending] = useActionState<FamilyState, FormData>(
    savePerson,
    undefined
  );
  const [kind, setKind] = useState<PersonKind>(person?.kind ?? "adult");
  // "__new__" shows a name field so a child can get a school without leaving
  // this form — the empty-list case that used to dead-end on "Not at school".
  const [schoolChoice, setSchoolChoice] = useState<string>(
    person?.school_id ?? (schools.length === 0 ? "__new__" : "")
  );

  useEffect(() => {
    if (state?.ok) onDone();
  }, [state?.ok, onDone]);

  return (
    <form action={submit} className="flex flex-col gap-3">
      {person ? (
        <input type="hidden" name="person_id" value={person.id} />
      ) : null}

      <Field label="Name">
        <input
          name="name"
          type="text"
          required
          defaultValue={person?.name ?? ""}
          className="field-input"
          placeholder="Ada"
        />
      </Field>

      <Field label="Who they are">
        <select
          name="kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as PersonKind)}
          className="field-input"
        >
          {PERSON_KINDS.map((option) => (
            <option key={option} value={option}>
              {PERSON_KIND_LABEL[option]}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="How they’re related"
        hint="optional"
        note="Just what you'd call them. Nothing depends on it."
      >
        <select
          name="relation"
          defaultValue={person?.relation ?? ""}
          className="field-input"
        >
          <option value="">Not saying</option>
          {PERSON_RELATIONS.map((option) => (
            <option key={option} value={option}>
              {PERSON_RELATION_LABEL[option]}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="Birthday"
        hint="optional"
        note="This is what puts their birthday on your home screen."
      >
        <input
          name="birthday"
          type="date"
          defaultValue={person?.birthday ?? ""}
          className="field-input tnum"
        />
      </Field>

      {kind === "child" ? (
        <>
          <Field
            label="School"
            hint="optional"
            note={
              schoolChoice === "__new__"
                ? "Saved with this child. You can add the address under Schools anytime."
                : undefined
            }
          >
            <select
              value={schoolChoice}
              onChange={(e) => setSchoolChoice(e.target.value)}
              className="field-input"
              aria-label="School"
            >
              <option value="">Not at school</option>
              {schools.map((school) => (
                <option key={school.id} value={school.id}>
                  {school.name}
                </option>
              ))}
              <option value="__new__">Add a new school…</option>
            </select>
            <input
              type="hidden"
              name="school_id"
              value={schoolChoice === "__new__" ? "" : schoolChoice}
            />
          </Field>

          {schoolChoice === "__new__" ? (
            <Field label="New school name">
              <input
                name="new_school_name"
                type="text"
                required
                className="field-input"
                placeholder="St Mary’s Primary"
              />
            </Field>
          ) : null}

          <Field label="School year" hint="optional">
            <select
              name="year_group"
              defaultValue={person?.year_group ?? ""}
              className="field-input"
            >
              <option value="">Not saying</option>
              {/* A value typed in before this was a picker keeps an option of
                  its own, so opening the form can't quietly drop it. */}
              {person?.year_group && !isSchoolYear(person.year_group) ? (
                <option value={person.year_group}>{person.year_group}</option>
              ) : null}
              {SCHOOL_YEARS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>
        </>
      ) : null}

      <Field label="Anything worth noting" hint="optional">
        <textarea
          name="notes"
          rows={2}
          defaultValue={person?.notes ?? ""}
          className="field-input"
          placeholder="Allergic to penicillin"
        />
      </Field>

      {state?.error ? (
        <p className="text-sm mark-fault">{state.error}</p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : person ? "Save" : "Add them"}
        </Button>
        <button type="button" onClick={onDone} className="text-action text-sm">
          Cancel
        </button>
      </div>
    </form>
  );
}

function RemovePerson({ person }: { person: HouseholdPerson }) {
  const [state, submit, pending] = useActionState<FamilyState, FormData>(
    deletePerson,
    undefined
  );
  const [confirming, setConfirming] = useState(false);

  return (
    <form
      action={submit}
      className="mt-3 flex items-center justify-between gap-3 border-t border-rule pt-3"
    >
      <input type="hidden" name="person_id" value={person.id} />
      <p className={`text-xs ${state?.error ? "mark-fault" : "text-ink-faint"}`}>
        {state?.error ??
          (confirming
            ? `Take ${person.name} off the family list?`
            : "Their birthday and school go with them.")}
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
