import Link from "next/link";
import { Suspense } from "react";
import SignOutButton from "@/components/SignOutButton";
import {
  LedgerPage,
  SectionHeading,
  Wordmark,
  statusEdgeClass,
} from "@/components/ui";
import { DOCUMENTS_SELECT, type DocumentRow } from "@/lib/document-types";
import { requireOnboarded, type Locale } from "@/lib/household";
import {
  contacts,
  documentLabel,
  groupByCategory,
  nextDate,
  OVERVIEW_STATUSES,
  parseAmount,
  spendByCurrency,
  upcomingDates,
  type OverviewDocument,
} from "@/lib/home-overview";
import { summariseHome } from "@/lib/home-summary";

export const metadata = { title: "Home overview · homeapp" };

const SOON_DAYS = 30;

export default async function DashboardPage() {
  const { supabase, user, household, property } = await requireOnboarded();
  const locale: Locale = household.locale ?? "UK";

  const { data } = await supabase
    .from("documents")
    .select(DOCUMENTS_SELECT)
    .eq("household_id", household.id)
    .in("extraction_status", [...OVERVIEW_STATUSES])
    .order("created_at", { ascending: false });

  const documents = (data as DocumentRow[] | null) ?? [];

  const detail = [
    property.type,
    property.year_built ? `built ${property.year_built}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  const coming = upcomingDates(documents);
  const categories = groupByCategory(documents);
  const totals = spendByCurrency(documents);
  const people = contacts(documents);

  return (
    <LedgerPage>
      <div className="flex items-start justify-between gap-4">
        <Wordmark className="text-sm" />
        <SignOutButton />
      </div>

      <header className="mt-6 border-b border-rule pb-5">
        <h1 className="text-3xl">{household.name}</h1>
        <p className="mt-1.5 whitespace-pre-line text-sm text-ink-soft">
          {property.address}
        </p>
        {detail ? <p className="text-sm text-ink-faint">{detail}</p> : null}
      </header>

      {documents.length === 0 ? (
        <section className="mt-10">
          <SectionHeading>Nothing to show yet</SectionHeading>
          <p className="mt-4 max-w-prose text-sm text-ink-soft">
            Once a document has been read, this page fills in with what is
            coming up, what it costs and who to call. Add the first one to get
            started.
          </p>
          <div className="mt-4">
            <Link href="/documents" className="btn inline-flex">
              Add a document
            </Link>
          </div>
        </section>
      ) : (
        <>
          <Suspense fallback={<GlanceFallback />}>
            <AtAGlance documents={documents} locale={locale} />
          </Suspense>

          <section className="mt-10">
            <SectionHeading
              aside={coming.length > 0 ? `${coming.length} dated` : undefined}
            >
              Coming up
            </SectionHeading>
            {coming.length === 0 ? (
              <p className="mt-4 text-sm text-ink-faint">
                No dates ahead in what has been read so far.
              </p>
            ) : (
              <ul className="mt-4">
                {coming.map((entry, i) => {
                  const soon = entry.daysAway <= SOON_DAYS;
                  return (
                    <li
                      key={`${entry.date}-${entry.label}-${i}`}
                      className={`entry flex items-baseline justify-between gap-4 py-2.5 pl-3 ${
                        soon ? "entry--review" : ""
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="text-sm">{entry.provider}</span>
                        <span className="ml-2 text-xs text-ink-faint">
                          {entry.label}
                        </span>
                      </span>
                      <span className="tnum shrink-0 text-right">
                        <span
                          className={`block text-sm ${soon ? "mark-review" : ""}`}
                        >
                          {formatDate(entry.date, locale)}
                        </span>
                        <span className="block text-xs text-ink-faint">
                          {relativeWhen(entry.daysAway)}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="mt-10">
            <SectionHeading
              aside={`${documents.length} ${
                documents.length === 1 ? "document" : "documents"
              }`}
            >
              By category
            </SectionHeading>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {categories.map((group) => (
                <section
                  key={group.category}
                  className="rounded border border-rule bg-paper-raised px-4 py-3"
                >
                  <h3 className="flex items-baseline justify-between gap-3 text-base">
                    {group.category}
                    <span className="tnum text-xs font-normal text-ink-faint">
                      {group.documents.length}
                    </span>
                  </h3>
                  <ul className="mt-2">
                    {group.documents.map((doc) => (
                      <li
                        key={doc.id}
                        className={`entry py-2 pl-2 ${statusEdgeClass(
                          doc.extraction_status
                        )}`}
                      >
                        <p className="text-sm">{documentLabel(doc)}</p>
                        {doc.doc_type ? (
                          <p className="text-xs text-ink-faint">
                            {doc.doc_type}
                          </p>
                        ) : null}
                        <RowMeta doc={doc} locale={locale} />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </section>

          <section className="mt-10">
            <SectionHeading>The numbers</SectionHeading>
            {totals.length === 0 ? (
              <p className="mt-4 text-sm text-ink-faint">
                No amounts have been picked up yet.
              </p>
            ) : (
              <ul className="mt-4">
                {totals.map((total) => (
                  <li
                    key={total.currency}
                    className="entry flex items-baseline justify-between gap-4 py-2.5 pl-3"
                  >
                    <span className="text-sm text-ink-soft">
                      {total.documents}{" "}
                      {total.documents === 1 ? "document" : "documents"} in{" "}
                      {total.currency}
                    </span>
                    <span className="tnum shrink-0 text-base">
                      {formatMoney(total.total, total.currency, locale)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-ink-faint">
              This only counts amounts read off the documents so far, so it is
              not the whole picture.
            </p>
          </section>

          <section className="mt-10">
            <SectionHeading>Key contacts</SectionHeading>
            {people.length === 0 ? (
              <p className="mt-4 text-sm text-ink-faint">
                No names or numbers have turned up yet.
              </p>
            ) : (
              <ul className="mt-4">
                {people.map((contact, i) => (
                  <li
                    key={`${contact.name ?? ""}-${contact.phone ?? ""}-${i}`}
                    className="entry flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5 pl-3"
                  >
                    <span>
                      <span className="text-sm">
                        {contact.name ?? contact.sourceDocument}
                      </span>
                      <span className="ml-2 text-xs text-ink-faint">
                        {contact.sourceDocument}
                      </span>
                    </span>
                    {contact.phone ? (
                      <a
                        href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`}
                        className="text-action tnum text-sm"
                      >
                        {contact.phone}
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <section className="mt-10">
        <SectionHeading>The documents file</SectionHeading>
        <p className="mt-4 max-w-prose text-sm text-ink-soft">
          Keep insurance, warranties, bills and the rest of the household
          paperwork in one place. Each one is read and sorted for you.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <Link href="/documents" className="btn inline-flex">
            Open the documents file
          </Link>
          <a href="/api/export" className="text-action text-sm">
            Export everything
          </a>
        </div>
      </section>

      <p className="mt-12 text-xs text-ink-faint">
        Signed in as {user.email}. Renewal reminders come next.
      </p>
    </LedgerPage>
  );
}

/* --- the AI summary: best-effort, omitted entirely if it doesn't come back --- */

async function AtAGlance({
  documents,
  locale,
}: {
  documents: readonly OverviewDocument[];
  locale: Locale;
}) {
  const summary = await summariseHome({ documents, locale });
  if (!summary) return null;

  return (
    <section className="mt-10">
      <SectionHeading>Your home at a glance</SectionHeading>
      <p className="mt-4 max-w-prose text-base">{summary}</p>
    </section>
  );
}

function GlanceFallback() {
  return (
    <section className="mt-10">
      <SectionHeading>Your home at a glance</SectionHeading>
      <p className="mt-4 text-sm text-ink-faint">Reading through the file…</p>
    </section>
  );
}

/* --- presentation ------------------------------------------------------- */

function RowMeta({ doc, locale }: { doc: OverviewDocument; locale: Locale }) {
  const date = nextDate(doc);
  const amount = parseAmount(doc.amount);

  const bits = [
    date ? formatDate(date, locale) : null,
    amount !== null && doc.currency
      ? formatMoney(amount, doc.currency, locale)
      : amount !== null
        ? String(amount)
        : null,
  ].filter(Boolean);

  if (bits.length === 0) return null;
  return (
    <p className="tnum mt-0.5 text-xs text-ink-soft">{bits.join(" · ")}</p>
  );
}

function intlLocale(locale: Locale): string {
  return locale === "US" ? "en-US" : "en-GB";
}

function formatDate(iso: string, locale: Locale): string {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatMoney(amount: number, currency: string, locale: Locale): string {
  try {
    return new Intl.NumberFormat(intlLocale(locale), {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function relativeWhen(daysAway: number): string {
  if (daysAway === 0) return "today";
  if (daysAway === 1) return "tomorrow";
  if (daysAway < 45) return `in ${daysAway} days`;
  const months = Math.round(daysAway / 30);
  return months < 12 ? `in about ${months} months` : "in over a year";
}
