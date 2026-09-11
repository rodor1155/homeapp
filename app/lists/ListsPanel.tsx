"use client";

import Link from "next/link";
import { useActionState, useCallback, useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { createList, type ListState } from "@/app/actions/lists";
import { Button, Field } from "@/components/ui";
import { outstandingLabel, type ShoppingList } from "@/lib/shopping";

type Props = {
  lists: ShoppingList[];
  /** How many things are still to get on each list, keyed by list id. */
  outstanding: Record<string, number>;
};

export default function ListsPanel({ lists, outstanding }: Props) {
  const [adding, setAdding] = useState(false);
  const stopAdding = useCallback(() => setAdding(false), []);

  return (
    <div className="flex flex-col gap-4">
      {lists.length === 0 ? (
        <p className="text-sm text-ink-faint">
          No lists yet. Start one for the weekly shop, and another for the
          things you only ever need from the DIY place.
        </p>
      ) : (
        <ul className="divide-y divide-rule">
          {lists.map((list) => {
            const count = outstanding[list.id] ?? 0;
            return (
              <li key={list.id}>
                <Link
                  href={`/lists/${list.id}`}
                  className="flex items-center gap-3 py-3 first:pt-0"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">
                      {list.name}
                    </span>
                    <span
                      className={`block truncate text-xs ${
                        count > 0 ? "text-ink-soft" : "text-ink-faint"
                      }`}
                    >
                      {list.notes ?? outstandingLabel(count)}
                    </span>
                  </span>
                  {count > 0 ? (
                    <span className="tnum shrink-0 rounded-pill bg-sage-tint px-2.5 py-1 text-xs font-semibold text-sage">
                      {count}
                    </span>
                  ) : null}
                  <span aria-hidden className="shrink-0 text-ink-faint">
                    <ChevronRight size={16} strokeWidth={1.9} />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <div className="border-t border-rule pt-4">
        {adding ? (
          <ListForm onDone={stopAdding} />
        ) : (
          <Button type="button" variant="quiet" onClick={() => setAdding(true)}>
            Start a list
          </Button>
        )}
      </div>
    </div>
  );
}

function ListForm({ onDone }: { onDone: () => void }) {
  const [state, submit, pending] = useActionState<ListState, FormData>(
    createList,
    undefined
  );

  useEffect(() => {
    if (state?.ok) onDone();
  }, [state?.ok, onDone]);

  return (
    <form action={submit} className="flex flex-col gap-3">
      <Field label="What is it for">
        <input
          name="name"
          type="text"
          required
          autoFocus
          className="field-input"
          placeholder="Weekly shop"
        />
      </Field>

      <Field label="Anything worth noting" hint="optional">
        <input
          name="notes"
          type="text"
          className="field-input"
          placeholder="Tesco, Saturday morning"
        />
      </Field>

      {state?.error ? (
        <p className="text-sm mark-fault">{state.error}</p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Starting…" : "Start it"}
        </Button>
        <button type="button" onClick={onDone} className="text-action text-sm">
          Cancel
        </button>
      </div>
    </form>
  );
}
