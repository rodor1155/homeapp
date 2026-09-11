"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import {
  deleteRoutine,
  saveRoutine,
  type RoutineState,
} from "@/app/actions/routines";
import { Button, Field } from "@/components/ui";
import {
  ROUTINE_CADENCE_LABEL,
  ROUTINE_CADENCES,
  type HouseholdRoutine,
  type RoutineCadence,
} from "@/lib/routines";
import { WEEKDAY_LABEL, WEEKDAYS, type Weekday } from "@/lib/timetable";

export default function RoutinesPanel({
  routines,
  fault,
}: {
  routines: HouseholdRoutine[];
  fault: string | null;
}) {
  const [adding, setAdding] = useState(false);
  const stop = useCallback(() => setAdding(false), []);

  return (
    <div className="flex flex-col gap-4">
      {fault ? (
        <p role="status" className="text-sm text-oxblood">
          {fault}
        </p>
      ) : null}
      {routines.length === 0 ? (
        <p className="text-sm text-ink-faint">
          Bin night, library books, recycling — add the weekly beats so Coming up
          reminds you.
        </p>
      ) : (
        <ul className="divide-y divide-rule">
          {routines.map((routine) => (
            <RoutineRow key={routine.id} routine={routine} />
          ))}
        </ul>
      )}
      <div className="border-t border-rule pt-4">
        {adding ? (
          <RoutineForm onDone={stop} />
        ) : (
          <Button type="button" variant="quiet" onClick={() => setAdding(true)}>
            Add a routine
          </Button>
        )}
      </div>
    </div>
  );
}

function RoutineRow({ routine }: { routine: HouseholdRoutine }) {
  const [editing, setEditing] = useState(false);
  const stop = useCallback(() => setEditing(false), []);
  const when =
    routine.cadence === "monthly"
      ? `Day ${routine.day_of_month}`
      : routine.weekday != null
        ? WEEKDAY_LABEL[routine.weekday]
        : "";

  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">
            {routine.title}
            {!routine.active ? (
              <span className="ml-2 text-xs text-ink-faint">paused</span>
            ) : null}
          </p>
          <p className="truncate text-xs text-ink-faint">
            {[ROUTINE_CADENCE_LABEL[routine.cadence], when, routine.notes]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <button
          type="button"
          className="text-action shrink-0 text-sm"
          onClick={() => setEditing((o) => !o)}
        >
          {editing ? "Close" : "Edit"}
        </button>
      </div>
      {editing ? (
        <div className="mt-3 rounded-lg bg-paper-sunk p-3">
          <RoutineForm routine={routine} onDone={stop} />
          <RemoveRoutine routineId={routine.id} />
        </div>
      ) : null}
    </li>
  );
}

function RoutineForm({
  routine,
  onDone,
}: {
  routine?: HouseholdRoutine;
  onDone: () => void;
}) {
  const [state, submit, pending] = useActionState<RoutineState, FormData>(
    saveRoutine,
    undefined
  );
  const [cadence, setCadence] = useState<RoutineCadence>(
    routine?.cadence ?? "weekly"
  );

  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);

  return (
    <form action={submit} className="flex flex-col gap-2">
      {routine ? (
        <input type="hidden" name="routine_id" value={routine.id} />
      ) : null}
      <Field label="What">
        <input
          name="title"
          className="field-input"
          required
          defaultValue={routine?.title ?? ""}
          placeholder="Bin night"
        />
      </Field>
      <Field label="How often">
        <select
          name="cadence"
          className="field-input"
          value={cadence}
          onChange={(e) => setCadence(e.target.value as RoutineCadence)}
        >
          {ROUTINE_CADENCES.map((c) => (
            <option key={c} value={c}>
              {ROUTINE_CADENCE_LABEL[c]}
            </option>
          ))}
        </select>
      </Field>
      {cadence === "monthly" ? (
        <Field label="Day of month">
          <input
            name="day_of_month"
            type="number"
            min={1}
            max={28}
            className="field-input"
            defaultValue={routine?.day_of_month ?? 1}
            required
          />
        </Field>
      ) : (
        <Field label="Day">
          <select
            name="weekday"
            className="field-input"
            defaultValue={routine?.weekday ?? 0}
            required
          >
            {WEEKDAYS.map((d) => (
              <option key={d} value={d}>
                {WEEKDAY_LABEL[d as Weekday]}
              </option>
            ))}
          </select>
        </Field>
      )}
      {cadence === "fortnightly" ? (
        <Field label="Anchor date (any past occurrence)" hint="YYYY-MM-DD">
          <input
            name="anchor_date"
            className="field-input"
            defaultValue={routine?.anchor_date ?? ""}
            placeholder="2026-09-01"
          />
        </Field>
      ) : null}
      <Field label="Notes">
        <input
          name="notes"
          className="field-input"
          defaultValue={routine?.notes ?? ""}
          placeholder="Black bins, put out by 7"
        />
      </Field>
      {routine ? (
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            name="active"
            value="true"
            defaultChecked={routine.active}
          />
          Active
        </label>
      ) : (
        <input type="hidden" name="active" value="true" />
      )}
      {state?.error ? (
        <p className="text-sm text-oxblood">{state.error}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : routine ? "Save" : "Add routine"}
        </Button>
        <Button type="button" variant="quiet" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function RemoveRoutine({ routineId }: { routineId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [state, submit, pending] = useActionState<RoutineState, FormData>(
    deleteRoutine,
    undefined
  );
  if (!confirming) {
    return (
      <button
        type="button"
        className="mt-2 text-xs text-oxblood"
        onClick={() => setConfirming(true)}
      >
        Remove
      </button>
    );
  }
  return (
    <form action={submit} className="mt-2 flex flex-wrap items-center gap-2">
      <input type="hidden" name="routine_id" value={routineId} />
      <span className="text-xs text-ink-soft">Remove this routine?</span>
      <Button type="submit" variant="danger" disabled={pending}>
        {pending ? "Removing…" : "Yes, remove"}
      </Button>
      <Button type="button" variant="quiet" onClick={() => setConfirming(false)}>
        Keep
      </Button>
      {state?.error ? (
        <p className="w-full text-sm text-oxblood">{state.error}</p>
      ) : null}
    </form>
  );
}
