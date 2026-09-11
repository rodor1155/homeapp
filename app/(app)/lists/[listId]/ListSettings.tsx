"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import {
  deleteList,
  renameList,
  type ListState,
} from "@/app/actions/lists";
import { Button, Field } from "@/components/ui";
import type { ShoppingList } from "@/lib/shopping";

export default function ListSettings({ list }: { list: ShoppingList }) {
  const [editing, setEditing] = useState(false);
  const stopEditing = useCallback(() => setEditing(false), []);

  return (
    <div className="flex flex-col gap-4">
      {editing ? (
        <ListForm list={list} onDone={stopEditing} />
      ) : (
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 text-sm text-ink-soft">
            Renaming it, or clearing it away once the shop is done.
          </p>
          <Button
            type="button"
            variant="quiet"
            className="shrink-0"
            onClick={() => setEditing(true)}
          >
            Rename
          </Button>
        </div>
      )}

      <RemoveList list={list} />
    </div>
  );
}

function ListForm({
  list,
  onDone,
}: {
  list: ShoppingList;
  onDone: () => void;
}) {
  const [state, submit, pending] = useActionState<ListState, FormData>(
    renameList,
    undefined
  );

  useEffect(() => {
    if (state?.ok) onDone();
  }, [state?.ok, onDone]);

  return (
    <form action={submit} className="flex flex-col gap-3">
      <input type="hidden" name="list_id" value={list.id} />

      <Field label="What it is for">
        <input
          name="name"
          type="text"
          required
          defaultValue={list.name}
          className="field-input"
          autoFocus
        />
      </Field>

      <Field label="Anything worth noting" hint="optional">
        <input
          name="notes"
          type="text"
          defaultValue={list.notes ?? ""}
          className="field-input"
          placeholder="Tesco, Saturday morning"
        />
      </Field>

      {state?.error ? (
        <p className="text-sm mark-fault">{state.error}</p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <button type="button" onClick={onDone} className="text-action text-sm">
          Cancel
        </button>
      </div>
    </form>
  );
}

function RemoveList({ list }: { list: ShoppingList }) {
  const [state, submit, pending] = useActionState<ListState, FormData>(
    deleteList,
    undefined
  );
  const [confirming, setConfirming] = useState(false);

  return (
    <form
      action={submit}
      className="flex items-center justify-between gap-3 border-t border-rule pt-3"
    >
      <input type="hidden" name="list_id" value={list.id} />
      <p className={`text-xs ${state?.error ? "mark-fault" : "text-ink-faint"}`}>
        {state?.error ??
          (confirming
            ? `Delete ${list.name} and everything on it?`
            : "Everything on the list goes with it.")}
      </p>
      {confirming ? (
        <button
          type="submit"
          disabled={pending}
          className="text-action mark-fault shrink-0 text-sm"
        >
          {pending ? "Deleting…" : "Yes, delete"}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="text-action shrink-0 text-sm"
        >
          Delete list
        </button>
      )}
    </form>
  );
}
