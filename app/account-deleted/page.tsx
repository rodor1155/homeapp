import Link from "next/link";
import AppMark from "@/components/AppMark";
import { LedgerPage, Wordmark } from "@/components/ui";
import { appTitle } from "@/lib/brand";

export const metadata = {
  title: appTitle("Account deleted"),
  description: "Your Hearth Home account and data have been deleted.",
};

export default function AccountDeletedPage() {
  return (
    <div className="min-h-dvh bg-paper">
      <LedgerPage size="reading" center>
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex items-center gap-2.5">
            <AppMark size="sm" />
            <Wordmark className="text-lg" />
          </div>
          <h1 className="font-display text-2xl text-ink">Account deleted</h1>
          <p className="text-sm leading-relaxed text-ink-soft">
            Your account and data have been deleted. You can close this page, or
            create a new account if you want to start again.
          </p>
          <Link href="/sign-up" className="btn min-h-11 px-6">
            Create a new account
          </Link>
          <Link href="/" className="text-action text-sm">
            Back to Hearth Home
          </Link>
        </div>
      </LedgerPage>
    </div>
  );
}
