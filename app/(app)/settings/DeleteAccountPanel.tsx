"use client";

import { useState, useTransition } from "react";
import { deleteAccount } from "@/app/actions/account";
import type { AccountDeletionHouseholdPreview } from "@/lib/account-deletion";
import ExportButton from "@/components/ExportButton";
import { Button, Field } from "@/components/ui";

// Kept in step with CONFIRMATION in app/actions/account.ts, which re-checks it.
const CONFIRMATION = "DELETE";

function memberLabel(count: number): string {
  return count === 1 ? "1 other member" : `${count} other members`;
}

function householdConsequence(row: AccountDeletionHouseholdPreview): string {
  if (row.soleMember) {
    return `Your household “${row.name}” and everything in it — documents, dates, renewals, lists, calendar links, kid links, invites — will be permanently deleted.`;
  }

  const others = memberLabel(row.otherMemberCount);
  let text = `You will leave “${row.name}”. ${others} keep the household and its data.`;

  if (row.userRole === "owner" && row.nextOwnerLabel) {
    text += ` ${row.nextOwnerLabel} becomes the owner.`;
  }

  return text;
}

export default function DeleteAccountPanel({
  preview,
  canExport,
  billingConfigured,
  demo = false,
  initialConfirmText = "",
}: {
  preview: AccountDeletionHouseholdPreview[];
  canExport: boolean;
  billingConfigured: boolean;
  /** Screenshot preview — renders the panel without server actions. */
  demo?: boolean;
  initialConfirmText?: string;
}) {
  const [confirmText, setConfirmText] = useState(initialConfirmText);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const armed = confirmText.trim() === CONFIRMATION;
  const cancelingSubscription = preview.some((row) => row.cancelSubscription);

  function remove() {
    if (demo) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteAccount(confirmText);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        {demo ? (
          <Button
            type="button"
            variant="quiet"
            className="w-full sm:w-auto"
          >
            Download my data
          </Button>
        ) : (
          <ExportButton
            canExport={canExport}
            billingConfigured={billingConfigured}
            variant="quiet"
            align="start"
            className="w-full sm:w-auto"
          >
            Download my data
          </ExportButton>
        )}
        <p className="text-sm text-ink-soft">
          A zip of your household&apos;s documents and the details we hold about
          your home, family, lists and dates.
        </p>
      </div>

      <div className="border-t border-rule pt-5">
        <h3 className="text-sm font-medium text-ink">Delete account</h3>
        <p className="mt-2 text-sm text-ink-soft">
          This cannot be undone, and we cannot get any of it back for you
          afterwards.
        </p>

        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-ink-soft">
          <li>
            Your sign-in is removed, so this email address can no longer open
            Hearth Home.
          </li>
          {preview.map((row) => (
            <li key={row.id}>{householdConsequence(row)}</li>
          ))}
          {cancelingSubscription ? (
            <li>
              Any active subscription on a household only you belong to will be
              cancelled immediately.
            </li>
          ) : null}
          <li>
            Gmail connections you set up are disconnected and their tokens
            removed.
          </li>
          <li>Reminder emails stop, including any already scheduled.</li>
        </ul>

        <div className="mt-5 border-t border-rule pt-4">
          <Field
            label={`Type ${CONFIRMATION} to confirm`}
            note="Nothing happens until this matches."
          >
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              className="field-input min-h-11"
              placeholder={CONFIRMATION}
            />
          </Field>

          {error ? <p className="mt-3 text-sm mark-fault">{error}</p> : null}

          <Button
            type="button"
            variant="danger"
            className="mt-4 min-h-11"
            disabled={!armed || pending}
            onClick={remove}
          >
            {pending ? "Deleting…" : "Delete my account"}
          </Button>
        </div>
      </div>
    </div>
  );
}
