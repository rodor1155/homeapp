"use client";

import { useActionState, useEffect, useState } from "react";
import {
  addMealIngredientsToList,
  deleteMeal,
  saveMeal,
  type MealState,
} from "@/app/actions/meals";
import { Button, Field } from "@/components/ui";
import type { MealPlan } from "@/lib/meals";
import { WEEKDAY_LABEL, WEEKDAYS, type Weekday } from "@/lib/timetable";

const SCHOOL_DAYS = WEEKDAYS.filter((d) => d <= 6);

export default function MealsPanel({
  meals,
  weekStart,
  fault,
}: {
  meals: MealPlan[];
  weekStart: string;
  fault: string | null;
}) {
  const byDay = new Map(meals.map((m) => [m.weekday, m]));

  return (
    <div className="flex flex-col gap-3">
      {fault ? (
        <p role="status" className="text-sm text-oxblood">
          {fault}
        </p>
      ) : null}
      <p className="text-xs text-ink-faint">
        Week of {weekStart} · dinners only — add ingredients, then push them to
        the shopping list.
      </p>
      <ul className="divide-y divide-rule">
        {SCHOOL_DAYS.map((day) => (
          <MealRow
            key={day}
            day={day as Weekday}
            meal={byDay.get(day as Weekday)}
            weekStart={weekStart}
          />
        ))}
      </ul>
    </div>
  );
}

function MealRow({
  day,
  meal,
  weekStart,
}: {
  day: Weekday;
  meal?: MealPlan;
  weekStart: string;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <li className="py-2.5 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
            {WEEKDAY_LABEL[day]}
          </p>
          <p className="truncate text-sm font-medium text-ink">
            {meal?.title ?? "—"}
          </p>
          {meal?.ingredients_note ? (
            <p className="truncate text-xs text-ink-faint">
              {meal.ingredients_note}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          className="text-action shrink-0 text-sm"
          onClick={() => setEditing((o) => !o)}
        >
          {editing ? "Close" : meal ? "Edit" : "Set"}
        </button>
      </div>
      {editing ? (
        <div className="mt-2 rounded-lg bg-paper-sunk p-3">
          <MealForm
            day={day}
            meal={meal}
            weekStart={weekStart}
            onDone={() => setEditing(false)}
          />
        </div>
      ) : null}
    </li>
  );
}

function MealForm({
  day,
  meal,
  weekStart,
  onDone,
}: {
  day: Weekday;
  meal?: MealPlan;
  weekStart: string;
  onDone: () => void;
}) {
  const [state, submit, pending] = useActionState<MealState, FormData>(
    saveMeal,
    undefined
  );
  const [shopState, shopSubmit, shopPending] = useActionState<
    MealState,
    FormData
  >(addMealIngredientsToList, undefined);
  const [delState, delSubmit, delPending] = useActionState<MealState, FormData>(
    deleteMeal,
    undefined
  );

  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);

  return (
    <div className="flex flex-col gap-2">
      <form action={submit} className="flex flex-col gap-2">
        {meal ? <input type="hidden" name="meal_id" value={meal.id} /> : null}
        <input type="hidden" name="week_start" value={weekStart} />
        <input type="hidden" name="weekday" value={day} />
        <Field label="Dinner">
          <input
            name="title"
            className="field-input"
            required
            defaultValue={meal?.title ?? ""}
            placeholder="Pasta, roast chicken…"
          />
        </Field>
        <Field label="Ingredients (comma or line separated)">
          <textarea
            name="ingredients_note"
            className="field-input min-h-16"
            defaultValue={meal?.ingredients_note ?? ""}
            placeholder="pasta, passata, basil"
          />
        </Field>
        {state?.error ? (
          <p className="text-sm text-oxblood">{state.error}</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
          <Button type="button" variant="quiet" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </form>
      {meal?.ingredients_note ? (
        <form action={shopSubmit}>
          <input type="hidden" name="meal_id" value={meal.id} />
          <Button type="submit" variant="quiet" disabled={shopPending}>
            {shopPending ? "Adding…" : "Add ingredients to shopping list"}
          </Button>
          {shopState?.error ? (
            <p className="mt-1 text-sm text-oxblood">{shopState.error}</p>
          ) : null}
          {shopState?.ok ? (
            <p className="mt-1 text-sm text-sage">Added to the list.</p>
          ) : null}
        </form>
      ) : null}
      {meal ? (
        <form action={delSubmit}>
          <input type="hidden" name="meal_id" value={meal.id} />
          <button
            type="submit"
            className="text-xs text-oxblood"
            disabled={delPending}
          >
            {delPending ? "Clearing…" : "Clear this day"}
          </button>
          {delState?.error ? (
            <p className="text-sm text-oxblood">{delState.error}</p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
