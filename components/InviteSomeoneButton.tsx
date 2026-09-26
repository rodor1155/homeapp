"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import InviteSomeoneSheet from "@/components/InviteSomeoneSheet";
import type { PendingInviteLink } from "@/lib/invite-links";

type Props = {
  pendingLinks: PendingInviteLink[];
  variant?: "primary" | "quiet";
  className?: string;
};

export default function InviteSomeoneButton({
  pendingLinks,
  variant = "quiet",
  className = "",
}: Props) {
  const [open, setOpen] = useState(false);

  const btnClass =
    variant === "primary"
      ? `btn min-h-11 ${className}`
      : `btn-quiet min-h-11 inline-flex items-center gap-1.5 ${className}`;

  return (
    <>
      <button
        type="button"
        className={btnClass}
        onClick={() => setOpen(true)}
      >
        {variant === "quiet" ? (
          <UserPlus size={16} aria-hidden strokeWidth={2} />
        ) : null}
        Invite someone
      </button>
      <InviteSomeoneSheet
        open={open}
        onClose={() => setOpen(false)}
        initialLinks={pendingLinks}
      />
    </>
  );
}
