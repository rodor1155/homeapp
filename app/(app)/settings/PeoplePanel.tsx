"use client";

import { useActionState } from "react";
import InviteSomeoneButton from "@/components/InviteSomeoneButton";
import {
  revokeInvite,
  type SettingsState,
} from "@/app/actions/settings";
import type { PendingInviteLink } from "@/lib/invite-links";
import type { SentInvite } from "@/lib/invites";
import type { HouseholdMember } from "@/lib/members";
import { Button } from "@/components/ui";

type Props = {
  members: HouseholdMember[];
  invites: SentInvite[];
  inviteLinks: PendingInviteLink[];
  currentUserId: string;
};

export default function PeoplePanel({
  members,
  invites,
  inviteLinks,
  currentUserId,
}: Props) {
  const emailInvites = invites.filter((invite) => invite.email);

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

        {emailInvites.map((invite) => (
          <InviteRow key={invite.id} invite={invite} />
        ))}
      </ul>

      <div className="flex flex-col gap-3 border-t border-rule pt-4">
        <p className="text-sm text-ink-soft">
          Invite a partner or another adult with a shareable link. They join
          with full access to everything in this household.
        </p>
        <InviteSomeoneButton pendingLinks={inviteLinks} variant="primary" />
      </div>
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
          {state?.error ?? "Email invite, not joined yet"}
        </span>
      </span>
      <form action={submit} className="shrink-0">
        <input type="hidden" name="invite_id" value={invite.id} />
        <Button type="submit" variant="quiet" disabled={pending} className="min-h-11 text-sm">
          {pending ? "Revoking…" : "Revoke"}
        </Button>
      </form>
    </li>
  );
}
