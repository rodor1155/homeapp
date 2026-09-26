"use client";

import CopyButton from "@/components/CopyButton";
import { Button } from "@/components/ui";
import {
  inviteLinkMetaLabel,
  type PendingInviteLink,
} from "@/lib/invite-links";
import { APP_NAME } from "@/lib/brand";
import { Share2 } from "lucide-react";
import { useCallback, useState } from "react";

const ACTION_BTN = "min-h-12 flex-1 text-base font-semibold";

export type InviteSomeoneContentProps = {
  createdUrl: string | null;
  pendingLinks: PendingInviteLink[];
  creating?: boolean;
  revokingId?: string | null;
  error?: string | null;
  /** Dev preview only — renders Share when navigator.share is absent. */
  forceShareAvailable?: boolean;
  onCreateLink: () => void;
  onRevoke: (id: string) => void;
};

export default function InviteSomeoneContent({
  createdUrl,
  pendingLinks,
  creating = false,
  revokingId = null,
  error = null,
  forceShareAvailable = false,
  onCreateLink,
  onRevoke,
}: InviteSomeoneContentProps) {
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
  const canShare =
    forceShareAvailable ||
    (typeof navigator !== "undefined" && typeof navigator.share === "function");

  const onShare = useCallback(async () => {
    if (!createdUrl || !navigator.share) return;
    try {
      await navigator.share({
        title: `Join ${APP_NAME}`,
        text: `Join our household on ${APP_NAME}`,
        url: createdUrl,
      });
    } catch {
      /* user cancelled */
    }
  }, [createdUrl]);

  return (
    <div className="flex flex-col gap-5 pb-2">
      <p className="text-sm leading-relaxed text-ink-soft">
        Share a link to invite a partner or another adult. They join with full
        access to documents, dates and lists. Each link works once and expires
        in 7 days.
      </p>

      {error ? <p className="text-sm mark-fault">{error}</p> : null}

      {createdUrl ? (
        <div className="flex flex-col gap-3 rounded-lg border border-rule bg-paper-sunk p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
            Invite link
          </p>
          <p className="break-all text-sm text-ink">{createdUrl}</p>
          <div className="flex gap-2">
            {canShare ? (
              <Button
                type="button"
                variant="accent"
                className={ACTION_BTN}
                onClick={onShare}
              >
                <Share2 size={18} aria-hidden className="mr-1.5" />
                Share
              </Button>
            ) : null}
            <CopyButton
              value={createdUrl}
              label="Copy link"
              className={`btn-quiet ${ACTION_BTN} ${canShare ? "" : "w-full"}`}
            />
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="accent"
          className="min-h-12 w-full text-base font-semibold"
          disabled={creating}
          onClick={onCreateLink}
        >
          {creating ? "Creating…" : "Create invite link"}
        </Button>
      )}

      {pendingLinks.length > 0 ? (
        <div className="flex flex-col gap-2 border-t border-rule pt-4">
          <h3 className="text-sm font-medium text-ink">Pending invites</h3>
          <ul className="divide-y divide-rule">
            {pendingLinks.map((link) => {
              const confirming = confirmRevokeId === link.id;
              return (
                <li
                  key={link.id}
                  className="flex items-center justify-between gap-3 py-3 first:pt-0"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-ink">
                      Invite link
                    </span>
                    <span
                      className={`block text-xs leading-relaxed ${
                        link.expired ? "mark-review" : "text-ink-faint"
                      }`}
                    >
                      {link.expired
                        ? `${inviteLinkMetaLabel(link)} — revoke or create a new one`
                        : inviteLinkMetaLabel(link)}
                    </span>
                  </span>
                  {confirming ? (
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        className="btn-danger min-h-11 px-3 text-sm"
                        disabled={revokingId === link.id}
                        onClick={() => {
                          onRevoke(link.id);
                          setConfirmRevokeId(null);
                        }}
                      >
                        {revokingId === link.id ? "Revoking…" : "Revoke"}
                      </button>
                      <button
                        type="button"
                        className="btn-quiet min-h-11 px-3 text-sm"
                        onClick={() => setConfirmRevokeId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="btn-ghost min-h-11 shrink-0 px-3 text-sm font-medium"
                      onClick={() => setConfirmRevokeId(link.id)}
                    >
                      Revoke
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
