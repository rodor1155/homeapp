import Link from "next/link";
import AppShell from "@/components/AppShell";
import { Card, Wordmark } from "@/components/ui";
import { isOnboarded, loadHouseholdContext } from "@/lib/household";
import { loadPendingInvites } from "@/lib/invites";
import InviteList from "./InviteList";

export const metadata = { title: "Invitations · homeapp" };

export default async function InvitePage() {
  const ctx = await loadHouseholdContext();
  if (!ctx.user) return <SignedOutPrompt />;

  const invites = await loadPendingInvites(ctx.supabase);
  const settled = isOnboarded(ctx);

  return (
    <AppShell user={ctx.user}>
      <div className="flex flex-col gap-4">
        <div className="px-1">
          <h1 className="text-2xl">Invitations</h1>
          <p className="mt-0.5 truncate text-sm text-ink-soft">
            Sent to {ctx.user.email}
          </p>
        </div>

        {settled && invites.length > 0 ? (
          <p className="margin-note mx-1">
            You already have {ctx.household?.name} set up. Accepting adds you to
            that household too, but the home you see stays this one.
          </p>
        ) : null}

        {invites.length === 0 ? (
          <Card className="text-center">
            <p className="text-sm text-ink-soft">No pending invitations.</p>
            <p className="mx-auto mt-1.5 max-w-xs text-sm text-ink-faint">
              An invitation has to be sent to the email address you signed in
              with.
            </p>
            <Link
              href={settled ? "/dashboard" : "/onboarding"}
              className="btn mt-5"
            >
              {settled ? "Back to your home" : "Set up your own home"}
            </Link>
          </Card>
        ) : (
          <InviteList invites={invites} />
        )}
      </div>
    </AppShell>
  );
}

/** Invite links land here cold, so the page has to work signed out. */
function SignedOutPrompt() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[27rem] flex-col justify-center gap-7 px-5 py-12">
      <header className="flex flex-col gap-4">
        <Wordmark className="text-sm" />
        <div>
          <h1 className="text-2xl">You’ve been invited</h1>
          <p className="mt-1.5 text-sm text-ink-soft">
            Sign in with the email address the invitation was sent to and we’ll
            bring you straight back here.
          </p>
        </div>
      </header>

      <div className="sheet flex flex-col gap-4">
        <Link href="/sign-in?next=/invite" className="btn">
          Sign in
        </Link>
        <p className="text-sm text-ink-soft">
          New here?{" "}
          <Link className="text-action" href="/sign-up?next=/invite">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
