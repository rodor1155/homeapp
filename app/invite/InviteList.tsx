"use client";

import { useState, useTransition } from "react";
import { acceptInvite, declineInvite } from "@/app/actions/invites";
import type { PendingInvite } from "@/lib/invites";
import { Button } from "@/components/ui";

type Choice = "accept" | "decline";

function InviteEntry({ invite }: { invite: PendingInvite }) {
  const [pending, startTransition] = useTransition();
  const [choice, setChoice] = useState<Choice | null>(null);
  const [error, setError] = useState<string | null>(null);

  function decide(next: Choice) {
    setChoice(next);
    setError(null);
    startTransition(async () => {
      const result =
        next === "accept"
          ? await acceptInvite(invite.invite_id)
          : await declineInvite(invite.invite_id);
      // A successful accept redirects, so we only get here on a problem.
      if (result?.error) {
        setError(result.error);
        setChoice(null);
      }
    });
  }

  return (
    <li className="card overflow-hidden p-4 sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-sage">
        Invitation
      </p>
      <h2 className="mt-1 text-lg">Join {invite.household_name}</h2>
      <p className="mt-1 text-sm text-ink-soft">
        {invite.invited_by_email
          ? `${invite.invited_by_email} asked you to share their household file.`
          : "Someone in this household asked you to share their household file."}
      </p>
      <p className="mt-0.5 text-sm text-ink-faint">
        You will see the same documents, dates and contacts they do.
      </p>

      {error ? <p className="mt-3 text-sm mark-fault">{error}</p> : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="button" disabled={pending} onClick={() => decide("accept")}>
          {pending && choice === "accept" ? "Joining…" : "Accept"}
        </Button>
        <button
          type="button"
          disabled={pending}
          onClick={() => decide("decline")}
          className="text-action text-sm disabled:opacity-40"
        >
          {pending && choice === "decline" ? "Declining…" : "Decline"}
        </button>
      </div>
    </li>
  );
}

export default function InviteList({ invites }: { invites: PendingInvite[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {invites.map((invite) => (
        <InviteEntry key={invite.invite_id} invite={invite} />
      ))}
    </ul>
  );
}
