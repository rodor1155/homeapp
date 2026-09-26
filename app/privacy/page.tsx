import Link from "next/link";
import AppMark from "@/components/AppMark";
import { LedgerPage, Wordmark } from "@/components/ui";
import { appTitle } from "@/lib/brand";

export const metadata = {
  title: appTitle("Privacy policy"),
  description:
    "How Hearth Home collects, uses and protects your household data.",
};

const CONTACT_EMAIL = "ross@ellner.co.uk";
const LAST_UPDATED = "18 September 2026";

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
              Hearth Home is a household app operated by Rodor. It helps you file
              documents, track dates, manage shopping lists and share a home
              with the people who live there. For data protection purposes, Rodor
              is the controller of the personal data described in this policy.
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
                <strong>Documents and photos</strong> — files you upload (PDFs,
                images and similar), the information extracted from them (such
                as provider, reference numbers and renewal dates), and any
                category you assign. If you connect Gmail, we scan your inbox
                read-only for PDF attachments you choose to import; we do not
                read your email for any other purpose.
              </li>
              <li>
                <strong>Calendars</strong> — ICS or web calendar URLs you paste
                for a school, and the term dates and events we cache from those
                feeds.
              </li>
              <li>
                <strong>Shopping lists</strong> — list names and item text you
                and your household add.
              </li>
              <li>
                <strong>Billing</strong> — if you subscribe, Stripe holds payment
                details; we store your plan status and Stripe customer reference
                on our side.
              </li>
              <li>
                <strong>Technical data</strong> — session cookies that keep you
                signed in, and standard server logs (which may include IP address
                and browser type) from our hosting provider. We do not currently
                run separate crash or analytics tooling that collects device
                identifiers.
              </li>
            </ul>
          </section>

          <section>
            <h2>How we use your data</h2>
            <p>We use this information to:</p>
            <ul>
              <li>provide and secure your account and household;</li>
              <li>store, extract and organise documents you upload;</li>
              <li>show dates, reminders, calendars and lists to your household;</li>
              <li>send reminder emails when you have upcoming document dates;</li>
              <li>process subscriptions where billing is enabled; and</li>
              <li>respond to support requests and keep the service reliable.</li>
            </ul>
            <p>
              We process your data to perform our contract with you (providing
              the app) and, where needed, for our legitimate interests in
              running a secure, well-maintained service. We ask for your consent
              before connecting Gmail or other optional integrations.
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
                <strong>Supabase</strong> — authentication, database and file
                storage for your household data.
              </li>
              <li>
                <strong>Vercel</strong> — hosting and delivery of the web app.
              </li>
              <li>
                <strong>Resend</strong> — sending reminder emails (when
                configured).
              </li>
              <li>
                <strong>Stripe</strong> — subscription payments (when billing is
                enabled).
              </li>
              <li>
                <strong>Anthropic</strong> — automated reading of uploaded
                documents to extract key fields (your files are sent for
                processing; we do not use them to train models).
              </li>
              <li>
                <strong>Google</strong> — optional sign-in and optional Gmail
                read-only import, only if you choose to connect.
              </li>
            </ul>
            <p>
              Other members of your household can see the documents, dates,
              lists and family information shared in that household. We do not
              sell your personal data.
            </p>
          </section>

          <section>
            <h2>Retention</h2>
            <p>
              We keep your data for as long as your account and household exist.
              If you delete your account in Settings, we remove your sign-in and
              delete households where you are the only member, including
              documents in storage. If you share a household, deleting your
              account removes your access but leaves the shared household data
              for other members. Gmail connection tokens are removed when you
              disconnect Gmail or delete your account. Deletion is immediate;
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
