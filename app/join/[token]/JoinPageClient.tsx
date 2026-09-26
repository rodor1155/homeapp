"use client";

import { useState } from "react";
import { acceptInviteLink } from "@/app/actions/invite-links";
import JoinHouseholdContent, {
  type JoinView,
} from "@/components/invite/JoinHouseholdContent";
import type { InviteLinkPreview } from "@/lib/invite-links";

type Props = {
  view: JoinView;
  preview: InviteLinkPreview;
  joinPath: string;
  token: string;
};

export default function JoinPageClient({
  view,
  preview,
  joinPath,
  token,
}: Props) {
  const [joinError, setJoinError] = useState<string | null>(null);

  async function onJoin() {
    setJoinError(null);
    const result = await acceptInviteLink(token);
    if (result?.error) setJoinError(result.error);
  }

  return (
    <JoinHouseholdContent
      view={view}
      preview={preview}
      joinPath={joinPath}
      onJoin={view === "confirm" ? onJoin : undefined}
      joinError={joinError}
    />
  );
}
