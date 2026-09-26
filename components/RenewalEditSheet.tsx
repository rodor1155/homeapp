"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import {
  createRenewalItem,
  deleteRenewalItem,
  markRenewalDone,
  updateRenewalItem,
  type RenewalState,
} from "@/app/actions/renewals";
import BottomSheet from "@/components/BottomSheet";
import CopyButton from "@/components/CopyButton";
import { Button, Field } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import { effectiveCategory } from "@/lib/categories";
import type { DocumentRow } from "@/lib/document-types";
import type { HouseholdPerson } from "@/lib/family";
import type { Locale } from "@/lib/household";
import {
  RENEWAL_KIND_META,
  RENEWAL_KINDS,
  type RenewalDraft,
  type RenewalItem,
} from "@/lib/renewals";

type DocOption = Pick<DocumentRow, "id" | "original_filename" | "category">;

type Props = {
  open: boolean;
  onClose: () => void;
  draft: RenewalDraft | null;
  editing?: RenewalItem | null;
  people: HouseholdPerson[];
  documents: DocOption[];
  locale: Locale;
  onDone?: () => void;
};

export default function RenewalEditSheet({
  open,
  onClose,
  draft,
  editing,
  people,
  documents,
  locale,
  onDone,
}: Props) {
  const isEdit = Boolean(editing);
  const action = isEdit ? updateRenewalItem : createRenewalItem;
  const [state, submit, pending] = useActionState<RenewalState, FormData>(
    action,
    undefined
  );
  const [markState, setMarkState] = useState<RenewalState>();
  const [deletePending, startDelete] = useTransition();
  const [markPending, startMark] = useTransition();
  const dueRef = useRef<HTMLInputElement>(null);

  const initial = editing ?? draft;
  const title = isEdit ? "Edit renewal" : "Track renewal";

  useEffect(() => {
    if (!open || !initial || isEdit) return;
    const t = setTimeout(() => dueRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, [open, initial, isEdit]);

  useEffect(() => {
    if (state?.ok) {
      onDone?.();
      onClose();
    }
  }, [state?.ok, onClose, onDone]);

  useEffect(() => {
    if (markState?.ok) {
      onDone?.();
      onClose();
    }
  }, [markState?.ok, onClose, onDone]);

  if (!initial) return null;

  const currencySymbol = locale === "US" ? "$" : "£";

  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <form action={submit} className="flex flex-col gap-4 pb-2">
        {isEdit ? <input type="hidden" name="id" value={editing!.id} /> : null}
        <input type="hidden" name="source" value={initial.source} />

        <Field label="Title">
          <input
            name="title"
            type="text"
            required
            defaultValue={initial.title}
            className="field-input"
          />
        </Field>

        <Field label="Kind">
          <select
            name="kind"
            defaultValue={initial.kind}
            className="field-input"
          >
            {RENEWAL_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {RENEWAL_KIND_META[kind].label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Who">
          <select
            name="person_id"
            defaultValue={initial.person_id ?? "house"}
            className="field-input"
          >
            <option value="house">The house</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Due date">
          <input
            ref={dueRef}
            name="due_date"
            type="date"
            required
            defaultValue={initial.due_date ?? ""}
            className="field-input tnum"
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Repeats">
            <select
              name="repeat_unit"
              defaultValue={initial.repeat_unit}
              className="field-input"
            >
              <option value="none">None</option>
              <option value="month">Monthly</option>
              <option value="year">Annually</option>
            </select>
          </Field>
          <Field label="Every (years/months)">
            <input
              name="repeat_every"
              type="number"
              min={1}
              max={20}
              defaultValue={initial.repeat_every}
              className="field-input tnum"
            />
          </Field>
        </div>

        <Field label="Remind me (days before)">
          <input
            name="remind_days"
            type="number"
            min={0}
            max={365}
            defaultValue={initial.remind_days}
            className="field-input tnum"
          />
        </Field>

        <Field label="Reference / plan number">
          <div className="flex items-center gap-1">
            <input
              name="reference"
              type="text"
              defaultValue={initial.reference ?? ""}
              className="field-input min-w-0 flex-1"
            />
            <CopyButton value={initial.reference ?? ""} />
          </div>
        </Field>

        <Field label="Provider">
          <input
            name="provider"
            type="text"
            defaultValue={initial.provider ?? ""}
            className="field-input"
          />
        </Field>

        <Field label={`Cost (${currencySymbol})`}>
          <input
            name="cost"
            type="text"
            inputMode="decimal"
            defaultValue={initial.cost ?? ""}
            className="field-input tnum"
          />
        </Field>

        <Field label="Notes">
          <textarea
            name="notes"
            rows={2}
            defaultValue={initial.notes ?? ""}
            className="field-input min-h-[4.5rem] resize-y"
          />
        </Field>

        <Field label="Linked document">
          <select
            name="document_id"
            defaultValue={initial.document_id ?? ""}
            className="field-input"
          >
            <option value="">None</option>
            {documents.map((doc) => {
              const cat = effectiveCategory(doc as DocumentRow);
              return (
                <option key={doc.id} value={doc.id}>
                  {doc.original_filename}
                  {cat ? ` · ${cat}` : ""}
                </option>
              );
            })}
          </select>
        </Field>

        {state?.error ? (
          <p className="text-sm mark-fault">{state.error}</p>
        ) : null}
        {markState?.error ? (
          <p className="text-sm mark-fault">{markState.error}</p>
        ) : null}
        {markState?.nextDue ? (
          <p className="text-sm mark-filed">
            Next due {formatDate(markState.nextDue, locale)}
          </p>
        ) : null}

        <div className="flex flex-col gap-2 pt-1">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : isEdit ? "Save changes" : "Track renewal"}
          </Button>

          {isEdit ? (
            <>
              <Button
                type="button"
                variant="quiet"
                disabled={markPending}
                onClick={() => {
                  startMark(async () => {
                    const result = await markRenewalDone(editing!.id);
                    setMarkState(result);
                  });
                }}
              >
                {markPending ? "Updating…" : "Mark done"}
              </Button>
              <Button
                type="button"
                variant="danger"
                disabled={deletePending}
                onClick={() => {
                  startDelete(async () => {
                    await deleteRenewalItem(editing!.id);
                    onDone?.();
                    onClose();
                  });
                }}
              >
                {deletePending ? "Removing…" : "Delete"}
              </Button>
            </>
          ) : null}
        </div>
      </form>
    </BottomSheet>
  );
}
