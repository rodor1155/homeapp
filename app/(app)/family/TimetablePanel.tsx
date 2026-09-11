"use client";

import { useActionState, useCallback, useEffect, useMemo, useState } from "react";
import {
  deleteTimetableSlot,
  extractTimetableAction,
  replacePersonTimetable,
  saveTimetableSlot,
  type TimetableState,
} from "@/app/actions/timetable";
import { Button, Field } from "@/components/ui";
import type { HouseholdPerson } from "@/lib/family";
import {
  groupSlotsByWeekday,
  WEEKDAY_LABEL,
  WEEKDAY_SHORT,
  WEEKDAYS,
  type PersonTimetableSlot,
  type TimetableSlotDraft,
  type Weekday,
} from "@/lib/timetable";

type Props = {
  people: HouseholdPerson[];
  slots: PersonTimetableSlot[];
  /** Soft-fail sentence when the table isn't deployed yet. */
  fault: string | null;
};

const SCHOOL_DAYS = WEEKDAYS.filter((d) => d <= 4);

export default function TimetablePanel({ people, slots, fault }: Props) {
  const children = useMemo(
    () => people.filter((p) => p.kind === "child"),
    [people]
  );
  const [personIdRaw, setPersonId] = useState<string>(children[0]?.id ?? "");
  const personId =
    children.some((c) => c.id === personIdRaw)
      ? personIdRaw
      : (children[0]?.id ?? "");

  if (children.length === 0) {
    return (
      <p className="text-sm text-ink-faint">
        Add a child under Who lives here first — their week hangs off that.
      </p>
    );
  }

  const childSlots = slots.filter((s) => s.person_id === personId);
  const byDay = groupSlotsByWeekday(childSlots);
  const child = children.find((c) => c.id === personId);

  return (
    <div className="flex flex-col gap-4">
      {fault ? (
        <p role="status" className="text-sm text-oxblood">
          {fault}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs font-medium text-ink-soft" htmlFor="tt-child">
          Whose week
        </label>
        <select
          id="tt-child"
          className="field-input max-w-full"
          value={personId}
          onChange={(e) => setPersonId(e.target.value)}
        >
          {children.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.year_group ? ` · ${c.year_group}` : ""}
            </option>
          ))}
        </select>
      </div>

      <ExtractCard personId={personId} childName={child?.name ?? "them"} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {SCHOOL_DAYS.map((day) => (
          <DayColumn
            key={day}
            day={day}
            personId={personId}
            slots={byDay[day]}
          />
        ))}
      </div>

      {(byDay[5].length > 0 || byDay[6].length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {[5, 6].map((day) => (
            <DayColumn
              key={day}
              day={day as Weekday}
              personId={personId}
              slots={byDay[day as Weekday]}
            />
          ))}
        </div>
      )}

      <AddSlotForm personId={personId} />
    </div>
  );
}

function DayColumn({
  day,
  personId,
  slots,
}: {
  day: Weekday;
  personId: string;
  slots: PersonTimetableSlot[];
}) {
  return (
    <div className="rounded-lg border border-rule bg-paper-raised p-2.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
        <span className="sm:hidden">{WEEKDAY_LABEL[day]}</span>
        <span className="hidden sm:inline">{WEEKDAY_SHORT[day]}</span>
      </p>
      {slots.length === 0 ? (
        <p className="mt-2 text-xs text-ink-faint">—</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1.5">
          {slots.map((slot) => (
            <SlotRow key={slot.id} slot={slot} personId={personId} />
          ))}
        </ul>
      )}
    </div>
  );
}

function SlotRow({
  slot,
  personId,
}: {
  slot: PersonTimetableSlot;
  personId: string;
}) {
  const [editing, setEditing] = useState(false);
  const stop = useCallback(() => setEditing(false), []);

  const flags = [
    slot.bring_kit ? slot.kit_label || "kit" : null,
    slot.bring_ingredients ? "ingredients" : null,
  ].filter(Boolean);

  if (editing) {
    return (
      <li className="rounded bg-paper-sunk p-2">
        <SlotForm slot={slot} personId={personId} onDone={stop} />
        <RemoveSlot slotId={slot.id} />
      </li>
    );
  }

  return (
    <li className="rounded bg-paper-sunk/60 px-2 py-1.5">
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="w-full text-left"
      >
        <span className="block truncate text-sm font-medium text-ink">
          {slot.subject}
        </span>
        <span className="block truncate text-[11px] text-ink-faint">
          {[slot.period_label || slot.start_time, slot.location, ...flags]
            .filter(Boolean)
            .join(" · ") || "Tap to edit"}
        </span>
      </button>
    </li>
  );
}

function SlotForm({
  slot,
  personId,
  onDone,
  defaultWeekday,
}: {
  slot?: PersonTimetableSlot;
  personId: string;
  onDone?: () => void;
  defaultWeekday?: Weekday;
}) {
  const [state, submit, pending] = useActionState<TimetableState, FormData>(
    saveTimetableSlot,
    undefined
  );
  const [bringKit, setBringKit] = useState(slot?.bring_kit ?? false);
  const [bringIng, setBringIng] = useState(slot?.bring_ingredients ?? false);

  useEffect(() => {
    if (state?.ok) onDone?.();
  }, [state, onDone]);

  return (
    <form action={submit} className="flex flex-col gap-2">
      <input type="hidden" name="person_id" value={personId} />
      {slot ? <input type="hidden" name="slot_id" value={slot.id} /> : null}
      <input type="hidden" name="auto_flags" value="0" />

      <Field label="Day">
        <select
          name="weekday"
          className="field-input"
          defaultValue={slot?.weekday ?? defaultWeekday ?? 0}
          required
        >
          {WEEKDAYS.map((d) => (
            <option key={d} value={d}>
              {WEEKDAY_LABEL[d]}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Subject">
        <input
          name="subject"
          className="field-input"
          defaultValue={slot?.subject ?? ""}
          required
          placeholder="PE, Maths, Food Tech…"
        />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Starts">
          <input
            name="start_time"
            className="field-input"
            defaultValue={slot?.start_time ?? ""}
            placeholder="09:15"
            inputMode="numeric"
          />
        </Field>
        <Field label="Ends">
          <input
            name="end_time"
            className="field-input"
            defaultValue={slot?.end_time ?? ""}
            placeholder="10:15"
            inputMode="numeric"
          />
        </Field>
      </div>

      <Field label="Period (if no times)">
        <input
          name="period_label"
          className="field-input"
          defaultValue={slot?.period_label ?? ""}
          placeholder="P3"
        />
      </Field>

      <Field label="Room">
        <input
          name="location"
          className="field-input"
          defaultValue={slot?.location ?? ""}
          placeholder="Gym, Lab 2…"
        />
      </Field>

      <label className="flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          name="bring_kit"
          value="true"
          checked={bringKit}
          onChange={(e) => setBringKit(e.target.checked)}
        />
        Bring kit
      </label>
      {bringKit ? (
        <Field label="Kit label">
          <input
            name="kit_label"
            className="field-input"
            defaultValue={slot?.kit_label ?? "PE kit"}
            placeholder="PE kit"
          />
        </Field>
      ) : null}

      <label className="flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          name="bring_ingredients"
          value="true"
          checked={bringIng}
          onChange={(e) => setBringIng(e.target.checked)}
        />
        Bring ingredients
      </label>
      {bringIng ? (
        <Field label="Ingredients note">
          <input
            name="ingredients_note"
            className="field-input"
            defaultValue={
              slot?.ingredients_note ?? "Ingredients for Food Tech"
            }
          />
        </Field>
      ) : null}

      {state?.error ? (
        <p role="status" className="text-sm text-oxblood">
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2 pt-1">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : slot ? "Save lesson" : "Add lesson"}
        </Button>
        {onDone ? (
          <Button type="button" variant="quiet" onClick={onDone}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function AddSlotForm({ personId }: { personId: string }) {
  const [open, setOpen] = useState(false);
  const stop = useCallback(() => setOpen(false), []);

  if (!open) {
    return (
      <Button type="button" variant="quiet" onClick={() => setOpen(true)}>
        Add a lesson
      </Button>
    );
  }

  return (
    <div className="rounded-lg border border-rule bg-paper-sunk p-3">
      <p className="mb-2 text-sm font-medium text-ink">Add a lesson</p>
      <SlotForm personId={personId} onDone={stop} />
    </div>
  );
}

function RemoveSlot({ slotId }: { slotId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [state, submit, pending] = useActionState<TimetableState, FormData>(
    deleteTimetableSlot,
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
      <input type="hidden" name="slot_id" value={slotId} />
      <span className="text-xs text-ink-soft">Remove this lesson?</span>
      <Button type="submit" variant="danger" disabled={pending}>
        {pending ? "Removing…" : "Yes, remove"}
      </Button>
      <Button
        type="button"
        variant="quiet"
        onClick={() => setConfirming(false)}
      >
        Keep
      </Button>
      {state?.error ? (
        <p className="w-full text-sm text-oxblood">{state.error}</p>
      ) : null}
    </form>
  );
}

function ExtractCard({
  personId,
  childName,
}: {
  personId: string;
  childName: string;
}) {
  const [state, submit, pending] = useActionState<TimetableState, FormData>(
    extractTimetableAction,
    undefined
  );
  const [open, setOpen] = useState(false);

  const drafts = state?.draftSlots;

  if (drafts && drafts.length > 0) {
    return (
      <ReviewDraft
        personId={personId}
        childName={childName}
        drafts={drafts}
        notes={state?.extractNotes ?? null}
        onCancel={() => setOpen(false)}
      />
    );
  }

  if (!open) {
    return (
      <div className="rounded-lg border border-dashed border-rule px-3 py-2.5">
        <p className="text-sm text-ink-soft">
          Photo or paste {childName}&rsquo;s week — we&rsquo;ll draft the grid
          for you to check.
        </p>
        <Button
          type="button"
          variant="quiet"
          className="mt-2"
          onClick={() => setOpen(true)}
        >
          Scan or paste timetable
        </Button>
      </div>
    );
  }

  return (
    <form
      action={submit}
      className="flex flex-col gap-3 rounded-lg border border-rule bg-paper-sunk p-3"
    >
      <input type="hidden" name="person_id" value={personId} />
      <Field label="Photo of the timetable">
        <input
          type="file"
          name="photo"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="field-input"
        />
      </Field>
      <Field label="Or paste the week">
        <textarea
          name="pasted_text"
          className="field-input min-h-24"
          placeholder={"Mon\nP1 Maths\nP2 PE\n…"}
        />
      </Field>
      {state?.error ? (
        <p role="status" className="text-sm text-oxblood">
          {state.error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Reading…" : "Read timetable"}
        </Button>
        <Button type="button" variant="quiet" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function ReviewDraft({
  personId,
  childName,
  drafts,
  notes,
  onCancel,
}: {
  personId: string;
  childName: string;
  drafts: TimetableSlotDraft[];
  notes: string | null;
  onCancel: () => void;
}) {
  const [rows, setRows] = useState(drafts);
  const [state, submit, pending] = useActionState<TimetableState, FormData>(
    replacePersonTimetable,
    undefined
  );

  useEffect(() => {
    if (state?.ok) onCancel();
  }, [state, onCancel]);

  function updateRow(index: number, patch: Partial<TimetableSlotDraft>) {
    setRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row))
    );
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-ochre/40 bg-ochre-wash p-3">
      <div>
        <p className="text-sm font-medium text-ink">
          Check {childName}&rsquo;s week before saving
        </p>
        <p className="text-xs text-ink-soft">
          Saving replaces their current timetable with this draft.
        </p>
        {notes ? (
          <p className="mt-1 text-xs text-ink-faint">{notes}</p>
        ) : null}
      </div>

      <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto">
        {rows.map((row, index) => (
          <li
            key={`${row.weekday}-${row.subject}-${index}`}
            className="rounded bg-paper-raised p-2"
          >
            <div className="grid gap-2 sm:grid-cols-4">
              <select
                className="field-input"
                value={row.weekday}
                onChange={(e) =>
                  updateRow(index, {
                    weekday: Number(e.target.value) as Weekday,
                  })
                }
              >
                {WEEKDAYS.map((d) => (
                  <option key={d} value={d}>
                    {WEEKDAY_SHORT[d]}
                  </option>
                ))}
              </select>
              <input
                className="field-input sm:col-span-2"
                value={row.subject}
                onChange={(e) => updateRow(index, { subject: e.target.value })}
              />
              <button
                type="button"
                className="text-xs text-oxblood"
                onClick={() => removeRow(index)}
              >
                Drop
              </button>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-3 text-xs text-ink-soft">
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={row.bring_kit}
                  onChange={(e) =>
                    updateRow(index, {
                      bring_kit: e.target.checked,
                      kit_label: e.target.checked
                        ? row.kit_label || "PE kit"
                        : null,
                    })
                  }
                />
                Kit
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={row.bring_ingredients}
                  onChange={(e) =>
                    updateRow(index, {
                      bring_ingredients: e.target.checked,
                      ingredients_note: e.target.checked
                        ? row.ingredients_note ||
                          `Ingredients for ${row.subject}`
                        : null,
                    })
                  }
                />
                Ingredients
              </label>
              <span className="text-ink-faint">
                {[row.period_label || row.start_time, row.location]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
          </li>
        ))}
      </ul>

      <form action={submit} className="flex flex-wrap gap-2">
        <input type="hidden" name="person_id" value={personId} />
        <input
          type="hidden"
          name="slots_json"
          value={JSON.stringify(rows)}
        />
        <Button type="submit" disabled={pending || rows.length === 0}>
          {pending ? "Saving…" : `Save ${rows.length} lessons`}
        </Button>
        <Button type="button" variant="quiet" onClick={onCancel}>
          Discard draft
        </Button>
        {state?.error ? (
          <p className="w-full text-sm text-oxblood">{state.error}</p>
        ) : null}
      </form>
    </div>
  );
}
