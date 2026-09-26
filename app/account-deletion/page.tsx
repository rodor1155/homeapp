import Link from "next/link";
import AppMark from "@/components/AppMark";
import { LedgerPage, Wordmark } from "@/components/ui";
import { appTitle } from "@/lib/brand";

export const metadata = {
  title: appTitle("Delete your account"),
  description:
    "How to delete your Hearth Home account, what is removed, and what happens in shared households.",
};

const CONTACT_EMAIL = "ross@ellner.co.uk";

export default function AccountDeletionPage() {
  return (
    <div className="min-h-dvh overflow-x-hidden bg-paper">
      <LedgerPage size="reading">
        <header className="mb-6 flex flex-col gap-3 border-b border-rule pb-5 sm:mb-8 sm:pb-6">
          <div className="flex items-center gap-2.5">
            <AppMark size="sm" />
            <Wordmark className="text-lg" />
          </div>
          <h1 className="font-display text-2xl text-ink">Delete your account</h1>
          <p className="text-sm text-ink-soft">
            How to remove your Hearth Home sign-in and what happens to your
            data.
          </p>
        </header>

        <article className="flex flex-col gap-6 text-sm leading-relaxed text-ink-soft sm:gap-8 [&_h2]:font-display [&_h2]:text-base [&_h2]:text-ink [&_li+li]:mt-2 [&_p+p]:mt-3 [&_strong]:break-words [&_strong]:font-medium [&_strong]:text-ink [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5">
          <section>
            <h2>How to delete your account</h2>
            <p>
              You must be signed in. Open{" "}
              <Link href="/settings" className="text-action">
                Settings
              </Link>
              , scroll to <strong>Account</strong>, and choose{" "}
              <strong>Delete my account</strong>. Type <strong>DELETE</strong>{" "}
              to confirm.
            </p>
            <p>
              Before you delete, you can download a copy of your household data
              from the same section using <strong>Download my data</strong>.
            </p>
          </section>

          <section>
            <h2>What is deleted</h2>
            <ul>
              <li>
                <strong>Your sign-in</strong> — your email address is removed
                from our authentication provider and can no longer open the app.
              </li>
              <li>
                <strong>Sole-member households</strong> — if you are the only
                person who can sign in to a household, that household and
                everything in it is permanently deleted: documents and files,
                family people and dates, renewals, shopping lists, calendar
                subscribe links, kid view links, and pending invites.
              </li>
              <li>
                <strong>Gmail connections</strong> — any Gmail import connection
                you set up is disconnected and its tokens are removed.
              </li>
            </ul>
          </section>

          <section>
            <h2>Shared households</h2>
            <p>
              If other people can still sign in to a household, deleting your
              account only removes <strong>your</strong> access. The household,
              its documents and everything else stays for the remaining members.
            </p>
            <p>
              Your entry on the Family page (if you were linked to a person
              there) stays as a name, but is no longer tied to your sign-in. If
              you were the owner, ownership passes to the member who joined
              earliest.
            </p>
          </section>

          <section>
            <h2>Subscriptions</h2>
            <p>
              Subscriptions belong to the household, not to you personally. If
              you are the only member, any active subscription is cancelled
              when you delete your account. In a shared household, the
              subscription continues for the people who remain.
            </p>
          </section>

          <section>
            <h2>When deletion takes effect</h2>
            <p>
              Deletion is immediate for your sign-in and for households where
              you are the only member. Copies in our provider&apos;s backups are
              overwritten on their normal schedule — we do not keep a separate
              archive of deleted accounts.
            </p>
          </section>

          <section>
            <h2>Cannot sign in?</h2>
            <p>
              If you cannot reach Settings, email us at{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="break-all text-action"
              >
                {CONTACT_EMAIL}
              </a>{" "}
              from the address on your account and we will verify and delete it
              for you.
            </p>
          </section>
        </article>

        <footer className="mt-8 border-t border-rule pt-5 text-center text-sm text-ink-faint sm:mt-10 sm:pt-6">
          <Link href="/privacy" className="text-action">
            Privacy policy
          </Link>
          <span className="mx-2">·</span>
          <Link href="/sign-in" className="text-action">
            Sign in
          </Link>
        </footer>
      </LedgerPage>
    </div>
  );
}
