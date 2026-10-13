"use client";

import { useCallback, useState, useTransition } from "react";
import BottomSheet from "@/components/BottomSheet";
import InviteSomeoneContent from "@/components/invite/InviteSomeoneContent";
import { usePaywall } from "@/components/PlanProvider";
import {
  createInviteLink,
  listInviteLinks,
  revokeInviteLink,
} from "@/app/actions/invite-links";
import type { PendingInviteLink } from "@/lib/invite-links";

type Props = {
  open: boolean;
  onClose: () => void;
  initialLinks: PendingInviteLink[];
};

export default function InviteSomeoneSheet({
  open,
  onClose,
  initialLinks,
}: Props) {
  const [links, setLinks] = useState(initialLinks);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const openPaywall = usePaywall();

  const onCreateLink = useCallback(() => {
    setError(null);
    startTransition(async () => {
      const result = await createInviteLink();
      if (result?.upgrade) {
        // The plan lapsed while the sheet was open.
        onClose();
        void openPaywall("sharing");
        return;
      }
      if (result?.error) {
        setError(result.error);
        return;
      }
      if (result?.url) {
        setCreatedUrl(result.url);
        setLinks(await listInviteLinks());
      }
    });
  }, [onClose, openPaywall]);

  const onRevoke = useCallback((id: string) => {
    setError(null);
    setRevokingId(id);
    startTransition(async () => {
      const result = await revokeInviteLink(id);
      setRevokingId(null);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setLinks((prev) => prev.filter((link) => link.id !== id));
    });
  }, []);

  return (
    <BottomSheet open={open} onClose={onClose} title="Invite someone">
      <InviteSomeoneContent
        createdUrl={createdUrl}
        pendingLinks={links}
        creating={pending && !revokingId}
        revokingId={revokingId}
        error={error}
        onCreateLink={onCreateLink}
        onRevoke={onRevoke}
      />
    </BottomSheet>
  );
}
