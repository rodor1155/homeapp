"use client";

import {
  useOptimistic,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import { Check } from "lucide-react";
import {
  addItem,
  clearChecked,
  deleteItem,
  moveItem,
  renameItem,
  setItemChecked,
  type ListState,
} from "@/app/actions/lists";
import { Button } from "@/components/ui";
import { splitItems, type ShoppingItem } from "@/lib/shopping";

/* The list itself. Every tap goes through the same path: show the change
   straight away, then let the server action confirm it — a shopping trip is
   the one place in this app where waiting for a round trip would be felt. */

type Patch =
  | { type: "add"; id: string; title: string }
  | { type: "rename"; id: string; title: string }
  | { type: "toggle"; id: string; checked: boolean }
  | { type: "remove"; id: string }
  | { type: "move"; id: string; direction: "up" | "down" }
  | { type: "clear" };

/** A row that hasn't come back from the server yet, so has no real id. */
function isPending(item: ShoppingItem): boolean {
  return item.id.startsWith("pending-");
}

function applyMove(
  items: readonly ShoppingItem[],
  id: string,
  direction: "up" | "down"
): ShoppingItem[] {
  const next = [...items];
  const from = next.findIndex((item) => item.id === id);
  if (from === -1) return next;

  // Ticked things sit below un-ticked ones, so a row only ever swaps with the
  // nearest neighbour on its own side of that line.
  const step = direction === "up" ? -1 : 1;
  let to = from + step;
  while (to >= 0 && to < next.length && next[to].checked !== next[from].checked) {
    to += step;
  }
  if (to < 0 || to >= next.length) return next;

  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

function reduce(items: readonly ShoppingItem[], patch: Patch): ShoppingItem[] {
  switch (patch.type) {
    case "add":
      return [
        ...items,
        {
          id: patch.id,
          list_id: items[0]?.list_id ?? "",
          title: patch.title,
          checked: false,
          sort_order: (items.at(-1)?.sort_order ?? 0) + 1,
          checked_at: null,
        },
      ];
    case "rename":
      return items.map((item) =>
        item.id === patch.id ? { ...item, title: patch.title } : item
      );
    case "toggle":
      return items.map((item) =>
        item.id === patch.id
          ? {
              ...item,
              checked: patch.checked,
              checked_at: patch.checked ? new Date().toISOString() : null,
            }
          : item
      );
    case "remove":
      return items.filter((item) => item.id !== patch.id);
    case "move":
      return applyMove(items, patch.id, patch.direction);
    case "clear":
      return items.filter((item) => !item.checked);
  }
}

export default function ItemsPanel({
  listId,
  items,
}: {
  listId: string;
  items: ShoppingItem[];
}) {
  const [optimisticItems, applyPatch] = useOptimistic(items, reduce);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function run(patch: Patch, action: () => Promise<ListState>) {
    startTransition(async () => {
      applyPatch(patch);
      const result = await action();
      setError(result?.error ?? null);
    });
  }

  function onAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = inputRef.current;
    const title = input?.value.trim() ?? "";
    if (!title) return;
    if (input) input.value = "";

    const formData = new FormData();
    formData.set("list_id", listId);
    formData.set("title", title);

    run({ type: "add", id: `pending-${crypto.randomUUID()}`, title }, () =>
      addItem(undefined, formData)
    );
  }

  const { toGet, inBasket } = splitItems(optimisticItems);

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={onAdd} className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          aria-label="Add to this list"
          className="field-input"
          placeholder="Add something"
          autoComplete="off"
          maxLength={200}
        />
        <Button type="submit" className="shrink-0">
          Add
        </Button>
      </form>

      {toGet.length === 0 ? (
        <p className="text-sm text-ink-faint">
          {inBasket.length === 0
            ? "Nothing on this list yet. Type the first thing above."
            : "That’s everything — it is all in the basket."}
        </p>
      ) : (
        <ul className="divide-y divide-rule border-t border-rule pt-1">
          {toGet.map((item, index) => (
            <ItemRow
              key={item.id}
              item={item}
              first={index === 0}
              last={index === toGet.length - 1}
              run={run}
            />
          ))}
        </ul>
      )}

      {inBasket.length > 0 ? (
        <div className="border-t border-rule pt-3">
          <div className="mb-1 flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-ink-faint">
              In the basket ({inBasket.length})
            </p>
            <ClearTicked
              count={inBasket.length}
              onClear={() =>
                run({ type: "clear" }, () => clearChecked(listId))
              }
            />
          </div>
          <ul className="divide-y divide-rule">
            {inBasket.map((item, index) => (
              <ItemRow
                key={item.id}
                item={item}
                first={index === 0}
                last={index === inBasket.length - 1}
                run={run}
              />
            ))}
          </ul>
        </div>
      ) : null}

      {error ? <p className="text-sm mark-fault">{error}</p> : null}
    </div>
  );
}

type Run = (patch: Patch, action: () => Promise<ListState>) => void;

function ItemRow({
  item,
  first,
  last,
  run,
}: {
  item: ShoppingItem;
  first: boolean;
  last: boolean;
  run: Run;
}) {
  const [editing, setEditing] = useState(false);
  const saved = !isPending(item);

  function onRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const field = new FormData(event.currentTarget);
    const title = String(field.get("title") ?? "").trim();
    if (!title || title === item.title) {
      setEditing(false);
      return;
    }
    field.set("item_id", item.id);
    setEditing(false);
    run({ type: "rename", id: item.id, title }, () =>
      renameItem(undefined, field)
    );
  }

  return (
    <li className="py-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!saved}
          onClick={() =>
            run({ type: "toggle", id: item.id, checked: !item.checked }, () =>
              setItemChecked(item.id, !item.checked)
            )
          }
          aria-pressed={item.checked}
          className="flex min-w-0 flex-1 items-center gap-3 py-2 text-left"
        >
          <span
            aria-hidden
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border transition-colors ${
              item.checked
                ? "border-sage-soft bg-sage-soft text-paper-raised"
                : "border-rule-strong"
            }`}
          >
            {item.checked ? <Check size={13} strokeWidth={3} /> : null}
          </span>
          <span
            className={`min-w-0 truncate text-sm ${
              item.checked
                ? "text-ink-faint line-through"
                : "font-medium text-ink"
            }`}
          >
            {item.title}
          </span>
        </button>
        {saved ? (
          <button
            type="button"
            onClick={() => setEditing((open) => !open)}
            className="text-action shrink-0 text-sm"
          >
            {editing ? "Close" : "Edit"}
          </button>
        ) : null}
      </div>

      {editing ? (
        <div className="mb-2 mt-1 rounded-lg bg-paper-sunk p-3">
          <form onSubmit={onRename} className="flex items-center gap-2">
            <input
              name="title"
              type="text"
              defaultValue={item.title}
              aria-label="What it is"
              className="field-input"
              maxLength={200}
              autoFocus
            />
            <Button type="submit" variant="quiet" className="shrink-0">
              Save
            </Button>
          </form>
          <div className="mt-3 flex items-center gap-4 border-t border-rule pt-3 text-sm">
            <button
              type="button"
              disabled={first}
              onClick={() =>
                run({ type: "move", id: item.id, direction: "up" }, () =>
                  moveItem(item.id, "up")
                )
              }
              className="text-action disabled:opacity-40"
            >
              Move up
            </button>
            <button
              type="button"
              disabled={last}
              onClick={() =>
                run({ type: "move", id: item.id, direction: "down" }, () =>
                  moveItem(item.id, "down")
                )
              }
              className="text-action disabled:opacity-40"
            >
              Move down
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                run({ type: "remove", id: item.id }, () => deleteItem(item.id));
              }}
              className="text-action mark-fault ml-auto"
            >
              Delete
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

function ClearTicked({
  count,
  onClear,
}: {
  count: number;
  onClear: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-action shrink-0 text-xs"
      >
        Clear ticked
      </button>
    );
  }

  return (
    <span className="flex shrink-0 items-center gap-3 text-xs">
      <span className="text-ink-faint">
        Clear {count} {count === 1 ? "thing" : "things"}?
      </span>
      <button
        type="button"
        onClick={() => {
          setConfirming(false);
          onClear();
        }}
        className="text-action mark-fault"
      >
        Yes, clear
      </button>
    </span>
  );
}
