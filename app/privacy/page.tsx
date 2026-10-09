import Link from "next/link";
import AppMark from "@/components/AppMark";
import {
  BillingDataCopy,
  PaymentSubprocessors,
} from "@/components/PrivacyBillingCopy";
import { LedgerPage, Wordmark } from "@/components/ui";
import { appTitle } from "@/lib/brand";

export const metadata = {
  title: appTitle("Privacy policy"),
  description:
    "How Hearth Home collects, uses and protects your household data.",
};

const CONTACT_EMAIL = "ross@ellner.co.uk";
const LAST_UPDATED = "9 October 2026";

export default function PrivacyPage() {
  return (
    <div className="min-h-dvh bg-paper">
      <LedgerPage size="reading">
        <header className="mb-8 flex flex-col gap-3 border-b border-rule pb-6">
          <div className="flex items-center gap-2.5">
            <AppMark size="sm" />
            <Wordmark className="text-lg" />
          </div>
          <h1 className="font-display text-2xl text-ink">Privacy policy</h1>
          <p className="text-sm text-ink-soft">
            Last updated {LAST_UPDATED}. This policy explains how{" "}
            <span className="font-display italic">Hearth Home</span>
            handles personal data for households in the United Kingdom.
          </p>
        </header>

        <article className="flex flex-col gap-8 text-sm leading-relaxed text-ink-soft [&_h2]:font-display [&_h2]:text-base [&_h2]:text-ink [&_li+li]:mt-2 [&_p+p]:mt-3 [&_strong]:font-medium [&_strong]:text-ink [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5">
          <section>
            <h2>Who we are</h2>
            <p>
              Hearth Home is a household app operated by Rodor. It helps you
              track dates, manage shopping lists and share a home with the
              people who live there. Bills and household documents live on your
              iPhone, encrypted on-device and synced through your own iCloud —
              Rodor&apos;s servers never receive document bytes or extracted
              text. For data protection purposes, Rodor is the controller of the
              personal data described in this policy.
            </p>
          </section>

          <section>
            <h2>What we collect</h2>
            <ul>
              <li>
                <strong>Account details</strong> — your email address and, if
                you provide one, your name when you sign up or sign in (email
                and password, magic link, or Google).
              </li>
              <li>
                <strong>Household membership</strong> — which household you
                belong to, your role, invitations sent or received, and the
                household name and locale you choose.
              </li>
              <li>
                <strong>Property and family information</strong> — address and
                property details, people who live in the home (including
                children&apos;s names, birthdays and year groups), schools, and
                key dates you add.
              </li>
              <li>
                <strong>Calendars</strong> — ICS or web calendar URLs you paste
                for a school or household feed, and the term dates and events we
                cache from those feeds.
              </li>
              <li>
                <strong>Shopping lists</strong> — list names and item text you
                and your household add.
              </li>
              <li>
                <strong>Billing</strong> — <BillingDataCopy />
              </li>
              <li>
                <strong>Technical data</strong> — session cookies that keep you
                signed in, and standard server logs (which may include IP address
                and browser type) from our hosting provider. We do not currently
                run separate crash or analytics tooling that collects device
                identifiers.
              </li>
            </ul>
            <p className="mt-3">
              <strong>Documents on your iPhone</strong> — photos and PDFs you
              file in the Hearth Home app stay on your device (and in your
              personal iCloud if you use iCloud). They are not uploaded to
              Rodor&apos;s servers.
            </p>
          </section>

          <section>
            <h2>How we use your data</h2>
            <p>We use this information to:</p>
            <ul>
              <li>provide and secure your account and household;</li>
              <li>show dates, calendars and lists to your household;</li>
              <li>process subscriptions where billing is enabled; and</li>
              <li>respond to support requests and keep the service reliable.</li>
            </ul>
            <p>
              We process your data to perform our contract with you (providing
              the app) and, where needed, for our legitimate interests in
              running a secure, well-maintained service.
            </p>
          </section>

          <section>
            <h2>Cookies and session storage</h2>
            <p>
              Hearth Home uses essential cookies set by Supabase Auth to maintain
              your signed-in session. These are required for the app to work. We
              do not use advertising or third-party tracking cookies.
            </p>
          </section>

          <section>
            <h2>Who we share data with</h2>
            <p>
              We use trusted subprocessors to run the service. They process data
              only on our instructions:
            </p>
            <ul>
              <li>
                <strong>Supabase</strong> — authentication and database for your
                household data (not document files).
              </li>
              <li>
                <strong>Vercel</strong> — hosting and delivery of the web app.
              </li>
              <PaymentSubprocessors />
              <li>
                <strong>Google</strong> — optional sign-in only, if you choose
                Continue with Google.
              </li>
            </ul>
            <p>
              Other members of your household can see the dates, lists and family
              information shared in that household. We do not sell your personal
              data.
            </p>
          </section>

          <section>
            <h2>Retention</h2>
            <p>
              We keep your data for as long as your account and household exist.
              If you delete your account in Settings, we remove your sign-in and
              delete households where you are the only member. If you share a
              household, deleting your account removes your access but leaves the
              shared household data for other members. Deletion is immediate;
              copies in our provider&apos;s backups are overwritten on their
              normal schedule.
            </p>
            <p>
              See{" "}
              <Link href="/account-deletion" className="text-action">
                Delete your account
              </Link>{" "}
              for step-by-step instructions and what happens to subscriptions in
              shared households.
            </p>
          </section>

          <section>
            <h2>Your rights</h2>
            <p>
              Under UK data protection law you have rights to access, rectify,
              erase, restrict, object to processing, and data portability where
              applicable. You can review and edit much of your household data in
              the app. To delete your account and associated personal data, go to{" "}
              <Link href="/settings" className="text-action">
                Settings
              </Link>{" "}
              → <strong>Account</strong> → <strong>Delete my account</strong> (you
              must be signed in), or read{" "}
              <Link href="/account-deletion" className="text-action">
                Delete your account
              </Link>
              .
            </p>
            <p>
              You may also lodge a complaint with the Information
              Commissioner&apos;s Office (ICO) in the UK. We would appreciate the
              chance to resolve your concern first — please contact us using the
              details below.
            </p>
          </section>

          <section>
            <h2>Contact</h2>
            <p>
              Questions about this policy or your data:{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-action">
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </section>
        </article>

        <footer className="mt-10 border-t border-rule pt-6 text-center text-sm text-ink-faint">
          <Link href="/sign-in" className="text-action">
            Back to sign in
          </Link>
          <span className="mx-2">·</span>
          <Link href="/" className="text-action">
            Hearth Home
          </Link>
        </footer>
      </LedgerPage>
    </div>
  );
}
