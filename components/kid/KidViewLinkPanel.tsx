"use client";

import { useCallback, useState, useTransition } from "react";
import {
  createKidLink,
  regenerateKidLink,
  revokeKidLink,
  type KidLinkState,
} from "@/app/actions/kid-links";
import CopyButton from "@/components/CopyButton";
import { Button } from "@/components/ui";
import { isCapacitorNative } from "@/lib/is-capacitor-native";
import { publicAppOrigin } from "@/lib/public-app-origin";
import { Share2 } from "lucide-react";

type Props = {
  personId: string;
  personName: string;
  token: string | null;
  /** When false, omits the top divider used inside the person edit sheet. */
  embedded?: boolean;
  /** Dev preview only — renders Share when navigator.share is absent. */
  forceShareAvailable?: boolean;
};

function kidViewUrl(token: string): string {
  return `${publicAppOrigin()}/kid/${token}`;
}

async function openExternal(url: string) {
  if (isCapacitorNative()) {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url });
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

export default function KidViewLinkPanel({
  personId,
  personName,
  token,
  embedded = true,
  forceShareAvailable = false,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const url = token ? kidViewUrl(token) : null;
  const canShare =
    forceShareAvailable ||
    (typeof navigator !== "undefined" && typeof navigator.share === "function");

  const run = useCallback(
    (action: () => Promise<KidLinkState>) => {
      setError(null);
      startTransition(async () => {
        const result = await action();
        if (result?.error) setError(result.error);
        if (result?.ok) {
          setConfirmRegenerate(false);
          setConfirmRevoke(false);
        }
      });
    },
    []
  );

  const onShare = useCallback(async () => {
    if (!url || !navigator.share) return;
    try {
      await navigator.share({
        title: `${personName}'s schedule`,
        text: `${personName}'s week on Hearth`,
        url,
      });
    } catch {
      /* user cancelled */
    }
  }, [personName, url]);

  return (
    <div
      className={
        embedded
          ? "mt-4 flex flex-col gap-4 border-t border-rule pt-4"
          : "flex flex-col gap-4"
      }
    >
      <div>
        <p className="text-sm font-medium text-ink">Kid view link</p>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">
          Anyone with this link can see {personName}&apos;s schedule. No account
          needed.
        </p>
      </div>

      {!token ? (
        <Button
          type="button"
          disabled={pending}
          onClick={() => run(() => createKidLink(personId))}
          className="min-h-11 w-fit"
        >
          {pending ? "Creating…" : "Create link"}
        </Button>
      ) : url ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="text"
              readOnly
              value={url}
              aria-label="Kid view link"
              className="field-input min-h-11 flex-1 truncate font-mono text-xs"
            />
            <CopyButton value={url} label="Copy link" />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {canShare ? (
              <button
                type="button"
                onClick={onShare}
                className="btn-accent inline-flex min-h-11 items-center justify-center gap-1.5 px-4"
              >
                <Share2 size={16} aria-hidden />
                Share
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => openExternal(url)}
              className="btn min-h-11"
            >
              Open
            </button>
          </div>

          <div className="border-t border-rule pt-4">
            {confirmRegenerate ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-ink-soft">
                  The old link stops working everywhere it was saved. Regenerate?
                </p>
                <div className="flex shrink-0 items-center gap-3">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => regenerateKidLink(personId))}
                    className="btn min-h-11"
                  >
                    {pending ? "Regenerating…" : "Confirm"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmRegenerate(false)}
                    className="text-action min-h-11 text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmRegenerate(true)}
                className="text-action min-h-11 text-sm"
              >
                Regenerate link
              </button>
            )}
          </div>

          <div className="border-t border-rule pt-4">
            {confirmRevoke ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-ink-soft">
                  Turn off the kid view link? The page will stop loading.
                </p>
                <div className="flex shrink-0 items-center gap-3">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => revokeKidLink(personId))}
                    className="text-action mark-fault min-h-11 text-sm"
                  >
                    {pending ? "Turning off…" : "Confirm"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmRevoke(false)}
                    className="text-action min-h-11 text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmRevoke(true)}
                className="text-action min-h-11 text-sm text-ink-faint"
              >
                Turn off
              </button>
            )}
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="status" className="text-sm mark-fault">
          {error}
        </p>
      ) : null}
    </div>
  );
}
