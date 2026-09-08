import Link from "next/link";
import SignOutButton from "@/components/SignOutButton";
import { LedgerPage, SectionHeading, Wordmark } from "@/components/ui";
import { requireOnboarded } from "@/lib/household";

export const metadata = { title: "Dashboard · homeapp" };

export default async function DashboardPage() {
  const { user, household, property } = await requireOnboarded();

  const detail = [
    property.type,
    property.year_built ? `built ${property.year_built}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <LedgerPage>
      <div className="flex items-start justify-between gap-4">
        <Wordmark className="text-sm" />
        <SignOutButton />
      </div>

      <header className="mt-6 border-b border-rule pb-5">
        <h1 className="text-3xl">{household.name}</h1>
        <p className="mt-1.5 text-sm text-ink-soft">{user.email}</p>
      </header>

      <section className="mt-10">
        <SectionHeading
          aside={household.locale === "UK" ? "United Kingdom" : "United States"}
        >
          The property
        </SectionHeading>
        <p className="mt-4 whitespace-pre-line text-base">{property.address}</p>
        {detail ? (
          <p className="mt-1 text-sm text-ink-soft">{detail}</p>
        ) : null}
      </section>

      <section className="mt-10">
        <SectionHeading>Documents</SectionHeading>
        <p className="mt-4 max-w-prose text-sm text-ink-soft">
          Keep insurance, warranties, bills and the rest of the household
          paperwork in one place. Each one is read and sorted for you.
        </p>
        <Link href="/documents" className="btn mt-4 inline-flex">
          Open the documents file
        </Link>
      </section>

      <p className="mt-12 text-xs text-ink-faint">
        Renewal reminders and a proper home overview come next.
      </p>
    </LedgerPage>
  );
}
