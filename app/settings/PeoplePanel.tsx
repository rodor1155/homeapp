"use client";

import { useActionState } from "react";
import {
  inviteMember,
  revokeInvite,
  type SettingsState,
} from "@/app/actions/settings";
import type { SentInvite } from "@/lib/invites";
import type { HouseholdMember } from "@/lib/members";
import { Button, Field } from "@/components/ui";

type Props = {
  members: HouseholdMember[];
  invites: SentInvite[];
  currentUserId: string;
};

export default function PeoplePanel({
  members,
  invites,
  currentUserId,
}: Props) {
  return (
    <div className="flex flex-col gap-4">
      <ul className="divide-y divide-rule">
        {members.map((member) => (
          <li
            key={member.user_id}
            className="flex items-center justify-between gap-3 py-2.5 first:pt-0"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-ink">
                {member.email ?? "Someone in this household"}
              </span>
              <span className="block text-xs text-ink-faint">
                {member.role === "owner" ? "Set this household up" : "Member"}
                {member.user_id === currentUserId ? " · you" : ""}
              </span>
            </span>
          </li>
        ))}

        {invites.map((invite) => (
          <InviteRow key={invite.id} invite={invite} />
        ))}
      </ul>

      <InviteForm />
    </div>
  );
}

function InviteRow({ invite }: { invite: SentInvite }) {
  const [state, submit, pending] = useActionState<SettingsState, FormData>(
    revokeInvite,
    undefined
  );

  return (
    <li className="flex items-center justify-between gap-3 py-2.5 first:pt-0">
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-ink">
          {invite.email}
        </span>
        <span
          className={`block text-xs ${
            state?.error ? "mark-fault" : "mark-review"
          }`}
        >
          {state?.error ?? "Invited, not joined yet"}
        </span>
      </span>
      <form action={submit} className="shrink-0">
        <input type="hidden" name="invite_id" value={invite.id} />
        <button
          type="submit"
          disabled={pending}
          className="text-action text-sm disabled:opacity-40"
        >
          {pending ? "Revoking…" : "Revoke"}
        </button>
      </form>
    </li>
  );
}

function InviteForm() {
  const [state, submit, pending] = useActionState<SettingsState, FormData>(
    inviteMember,
    undefined
  );

  return (
    <form
      action={submit}
      className="flex flex-col gap-3 border-t border-rule pt-4"
    >
      <Field
        label="Invite someone else"
        note="They will see the same documents, dates and contacts you do."
      >
        <input
          name="email"
          type="email"
          autoComplete="off"
          required
          className="field-input"
          placeholder="partner@example.com"
        />
      </Field>

      {state?.error ? (
        <p className="text-sm mark-fault">{state.error}</p>
      ) : null}
      {state?.ok ? (
        <p className="text-sm mark-filed">
          Invitation noted. They can accept it once they sign in with that
          address.
        </p>
      ) : null}

      <div>
        <Button type="submit" variant="quiet" disabled={pending}>
          {pending ? "Sending…" : "Send invitation"}
        </Button>
      </div>
    </form>
  );
}
