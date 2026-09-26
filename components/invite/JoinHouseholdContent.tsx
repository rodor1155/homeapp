"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useTransition } from "react";
import AppMark from "@/components/AppMark";
import { APP_NAME } from "@/lib/brand";
import type { InviteLinkPreview } from "@/lib/invite-links";

export type JoinView =
  | "signed-out"
  | "confirm"
  | "already-member"
  | "expired"
  | "used"
  | "revoked";

const PRIMARY_BTN = "btn-accent min-h-12 w-full text-base font-semibold";
const SECONDARY_BTN = "btn-quiet min-h-12 w-full text-base font-semibold";

type Props = {
  view: JoinView;
  preview: InviteLinkPreview;
  joinPath: string;
  onJoin?: () => Promise<void>;
  joinError?: string | null;
};

export default function JoinHouseholdContent({
  view,
  preview,
  joinPath,
  onJoin,
  joinError = null,
}: Props) {
  const [pending, startTransition] = useTransition();
  const { household_name, invited_by_name } = preview;
  const signInHref = `/sign-in?next=${encodeURIComponent(joinPath)}`;
  const signUpHref = `/sign-up?next=${encodeURIComponent(joinPath)}`;

  if (view === "expired" || view === "used" || view === "revoked") {
    const message =
      view === "expired"
        ? "This invite link has expired."
        : view === "used"
          ? "This invite link has already been used."
          : "This invite link has been revoked.";
    return (
      <JoinCard>
        <h1 className="text-xl text-ink">{message}</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          Ask {invited_by_name} to send you a fresh link from the Family or
          Settings page in {APP_NAME}.
        </p>
        <Link href="/sign-in" className={`${PRIMARY_BTN} mt-6`}>
          Sign in
        </Link>
      </JoinCard>
    );
  }

  if (view === "signed-out") {
    return (
      <JoinCard>
        <JoinHouseholdHeader householdName={household_name} />
        <p className="mt-4 text-sm text-ink-soft">
          <span className="font-medium text-ink">{invited_by_name}</span> invited
          you to join on {APP_NAME}.
        </p>
        <p className="mt-3 text-sm text-ink-faint">
          You&apos;ll join as an adult with full access to the household&apos;s
          documents, dates and lists.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <Link href={signUpHref} className={PRIMARY_BTN}>
            Create account
          </Link>
          <Link href={signInHref} className={SECONDARY_BTN}>
            Sign in
          </Link>
        </div>
      </JoinCard>
    );
  }

  if (view === "already-member") {
    return (
      <JoinCard>
        <JoinHouseholdHeader householdName={household_name} />
        <h1 className="mt-4 text-xl text-ink">
          You&apos;re already in {household_name}
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          Your account already has access to this household.
        </p>
        <Link href="/dashboard" className={`${PRIMARY_BTN} mt-6`}>
          Go to Home
        </Link>
      </JoinCard>
    );
  }

  return (
    <JoinCard>
      <JoinHouseholdHeader householdName={household_name} />
      <h1 className="mt-4 text-xl text-ink">Join {household_name}?</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
        <span className="font-medium text-ink">{invited_by_name}</span> invited
        you. You&apos;ll join as an adult with full access to documents, dates,
        lists and settings.
      </p>
      {joinError ? (
        <p className="mt-3 text-sm mark-fault">{joinError}</p>
      ) : null}
      <div className="mt-6 flex flex-col gap-3">
        <button
          type="button"
          className={PRIMARY_BTN}
          disabled={pending}
          onClick={() => {
            if (!onJoin) return;
            startTransition(async () => {
              await onJoin();
            });
          }}
        >
          {pending ? "Joining…" : `Join ${household_name}`}
        </button>
        <Link href="/dashboard" className={`${SECONDARY_BTN} text-center`}>
          Not now
        </Link>
      </div>
    </JoinCard>
  );
}

function JoinHouseholdHeader({ householdName }: { householdName: string }) {
  return (
    <div className="flex items-center gap-3">
      <AppMark size="md" />
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
          Household invite
        </p>
        <p className="truncate text-base font-semibold text-ink">{householdName}</p>
      </div>
    </div>
  );
}

function JoinCard({ children }: { children: ReactNode }) {
  return (
    <div className="sheet mx-auto flex w-full max-w-md flex-col gap-1">
      {children}
    </div>
  );
}
