"use client";

import { useState, useTransition } from "react";
import { deleteAccount } from "@/app/actions/account";
import { Button, Field } from "@/components/ui";

// Kept in step with CONFIRMATION in app/actions/account.ts, which re-checks it.
const CONFIRMATION = "DELETE";

export default function DeleteAccountPanel({
  householdName,
  soleMember,
}: {
  householdName: string;
  soleMember: boolean;
}) {
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const armed = confirmText.trim() === CONFIRMATION;

  function remove() {
    setError(null);
    startTransition(async () => {
      // A successful delete redirects, so we only get here on a problem.
      const result = await deleteAccount(confirmText);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink-soft">
        This cannot be undone, and we cannot get any of it back for you
        afterwards.
      </p>

      <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink-soft">
        <li>
          Your sign-in is removed, so this email address can no longer open
          homeapp.
        </li>
        <li>
          {soleMember
            ? `You are the only person in ${householdName}, so it goes too — every document, every file and everything read off them.`
            : "Any household where you are the only member is deleted, along with every document and file in it."}
        </li>
        <li>
          {soleMember
            ? "A household you shared with someone else would keep going without you."
            : `${householdName} keeps going without you. The others in it keep every document.`}
        </li>
        <li>Reminders stop, including any already scheduled.</li>
      </ul>

      <div className="border-t border-rule pt-4">
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
            className="field-input"
            placeholder={CONFIRMATION}
          />
        </Field>

        {error ? <p className="mt-3 text-sm mark-fault">{error}</p> : null}

        <Button
          type="button"
          variant="danger"
          className="mt-4"
          disabled={!armed || pending}
          onClick={remove}
        >
          {pending ? "Deleting…" : "Delete my account"}
        </Button>
      </div>
    </div>
  );
}
