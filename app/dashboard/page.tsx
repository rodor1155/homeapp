import Link from "next/link";
import { Suspense } from "react";
import {
  Car,
  ClipboardCheck,
  Folder,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import AppShell from "@/components/AppShell";
import { Card, SectionHeading, statusEdgeClass } from "@/components/ui";
import { DOCUMENTS_SELECT, type DocumentRow } from "@/lib/document-types";
import { requireOnboarded, type Locale } from "@/lib/household";
import { loadPendingInvites } from "@/lib/invites";
import {
  contacts,
  documentLabel,
  groupByCategory,
  nextDate,
  OVERVIEW_STATUSES,
  parseAmount,
  spendByCurrency,
  upcomingDates,
  type Category,
  type OverviewDocument,
} from "@/lib/home-overview";
import { summariseHome } from "@/lib/home-summary";

export const metadata = { title: "Home overview · homeapp" };

const SOON_DAYS = 30;

const CATEGORY_ICON: Record<Category, LucideIcon> = {
  Insurance: ShieldCheck,
  "Utilities & bills": Zap,
  Vehicle: Car,
  "Property & compliance": ClipboardCheck,
  "Warranties & appliances": Wrench,
  "Subscriptions & services": RefreshCw,
  Other: Folder,
};

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
  const invites = await loadPendingInvites(supabase);

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
    <AppShell user={user}>
      <div className="flex flex-col gap-4">
        {invites.length > 0 ? (
          <Card tone="accent">
            <h2 className="text-base font-semibold text-ink">
              {invites.length === 1
                ? `You’ve been invited to join ${invites[0].household_name}`
                : `You’ve been invited to join ${invites.length} households`}
            </h2>
            <p className="mt-1 text-sm text-ink-soft">
              Accepting shares that household’s documents, dates and contacts
              with you.
            </p>
            <Link href="/invite" className="btn mt-4">
              See the invitation
            </Link>
          </Card>
        ) : null}

        <section className="home-hero card overflow-hidden p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-sage">
                Your home
              </p>
              <h1 className="mt-1 text-2xl">{household.name}</h1>
              <p className="mt-1 whitespace-pre-line text-sm text-ink-soft">
                {property.address}
              </p>
              {detail ? (
                <p className="mt-0.5 text-sm text-ink-faint">{detail}</p>
              ) : null}
            </div>
            <HouseIllustration className="h-16 w-24" />
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/documents" className="btn">
              Open the documents file
            </Link>
            <a href="/api/export" className="btn-quiet">
              Export everything
            </a>
          </div>
        </section>

        {documents.length === 0 ? (
          <Card className="text-center">
            <HouseIllustration className="mx-auto h-24 w-32" />
            <h2 className="mt-3 text-lg">Nothing filed yet</h2>
            <p className="mx-auto mt-2 max-w-xs text-sm text-ink-soft">
              Once a document has been read, this page fills in with what is
              coming up, what it costs and who to call.
            </p>
            <Link href="/documents" className="btn mt-5">
              Add a document
            </Link>
          </Card>
        ) : (
          <>
            <Suspense fallback={<GlanceFallback />}>
              <AtAGlance documents={documents} locale={locale} />
            </Suspense>

            <Card
              title="Coming up"
              action={
                coming.length > 0 ? (
                  <span className="tnum text-xs text-ink-faint">
                    {coming.length} dated
                  </span>
                ) : undefined
              }
            >
              {coming.length === 0 ? (
                <p className="text-sm text-ink-faint">
                  No dates ahead in what has been read so far.
                </p>
              ) : (
                <ul className="divide-y divide-rule">
                  {coming.map((entry, i) => {
                    const soon = entry.daysAway <= SOON_DAYS;
                    return (
                      <li
                        key={`${entry.date}-${entry.label}-${i}`}
                        className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                      >
                        <span className="flex min-w-0 items-center gap-2.5">
                          <span
                            aria-hidden
                            className={`h-2 w-2 shrink-0 rounded-full ${
                              soon ? "bg-ochre" : "bg-rule-strong"
                            }`}
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-ink">
                              {entry.provider}
                            </span>
                            <span className="block text-xs text-ink-faint">
                              {entry.label}
                            </span>
                          </span>
                        </span>
                        <span className="tnum shrink-0 text-right">
                          <span className="block text-sm text-ink">
                            {formatDate(entry.date, locale)}
                          </span>
                          <span
                            className={`block text-xs ${
                              soon ? "mark-review font-medium" : "text-ink-faint"
                            }`}
                          >
                            {relativeWhen(entry.daysAway)}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            <div>
              <SectionHeading
                aside={`${documents.length} ${
                  documents.length === 1 ? "document" : "documents"
                }`}
              >
                By category
              </SectionHeading>
              <div className="grid grid-cols-2 gap-3">
                {categories.map((group) => {
                  const Icon = CATEGORY_ICON[group.category];
                  const n = group.documents.length;
                  return (
                    <div
                      key={group.category}
                      className="card flex flex-col gap-2 p-3.5"
                    >
                      <span
                        aria-hidden
                        className="flex h-9 w-9 items-center justify-center rounded-pill bg-sage-tint text-sage"
                      >
                        <Icon size={18} strokeWidth={1.9} />
                      </span>
                      <span className="text-sm font-medium leading-snug text-ink">
                        {group.category}
                      </span>
                      <span className="tnum text-xs text-ink-faint">
                        {n} {n === 1 ? "document" : "documents"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {categories.map((group) => {
              const Icon = CATEGORY_ICON[group.category];
              return (
                <Card key={group.category} padding="none">
                  <div className="flex items-center gap-2.5 px-4 pb-2.5 pt-4">
                    <span aria-hidden className="text-sage">
                      <Icon size={16} strokeWidth={2} />
                    </span>
                    <h3 className="text-sm font-semibold text-ink">
                      {group.category}
                    </h3>
                    <span className="tnum ml-auto text-xs text-ink-faint">
                      {group.documents.length}
                    </span>
                  </div>
                  <ul className="border-t border-rule">
                    {group.documents.map((doc) => (
                      <li
                        key={doc.id}
                        className={`entry px-4 py-3 ${statusEdgeClass(
                          doc.extraction_status
                        )}`}
                      >
                        <p className="text-sm font-medium text-ink">
                          {documentLabel(doc)}
                        </p>
                        {doc.doc_type ? (
                          <p className="text-xs text-ink-faint">
                            {doc.doc_type}
                          </p>
                        ) : null}
                        <RowMeta doc={doc} locale={locale} />
                      </li>
                    ))}
                  </ul>
                </Card>
              );
            })}

            <Card title="The numbers">
              {totals.length === 0 ? (
                <p className="text-sm text-ink-faint">
                  No amounts have been picked up yet.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {totals.map((total) => (
                    <div
                      key={total.currency}
                      className="rounded-lg bg-paper-sunk px-3.5 py-3"
                    >
                      <p className="tnum text-lg font-semibold text-ink">
                        {formatMoney(total.total, total.currency, locale)}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-faint">
                        {total.documents}{" "}
                        {total.documents === 1 ? "document" : "documents"} in{" "}
                        {total.currency}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-3 text-xs text-ink-faint">
                This only counts amounts read off the documents so far, so it is
                not the whole picture.
              </p>
            </Card>

            <Card title="Key contacts">
              {people.length === 0 ? (
                <p className="text-sm text-ink-faint">
                  No names or numbers have turned up yet.
                </p>
              ) : (
                <ul className="divide-y divide-rule">
                  {people.map((contact, i) => (
                    <li
                      key={`${contact.name ?? ""}-${contact.phone ?? ""}-${i}`}
                      className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span
                          aria-hidden
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sage-tint text-xs font-semibold text-sage"
                        >
                          {contactInitial(contact.name ?? contact.sourceDocument)}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-ink">
                            {contact.name ?? contact.sourceDocument}
                          </span>
                          <span className="block truncate text-xs text-ink-faint">
                            {contact.sourceDocument}
                          </span>
                        </span>
                      </span>
                      {contact.phone ? (
                        <a
                          href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`}
                          className="tnum shrink-0 rounded-pill bg-paper-sunk px-3 py-1.5 text-xs font-medium text-ink"
                        >
                          {contact.phone}
                        </a>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>
        )}

        <p className="px-1 pt-2 text-center text-xs text-ink-faint">
          Signed in as {user.email}. Renewal reminders come next.
        </p>
      </div>
    </AppShell>
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
    <Card tone="accent">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pill bg-paper-raised text-sage"
        >
          <Sparkles size={18} strokeWidth={1.9} />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-ink">
            Your home at a glance
          </h2>
          <p className="mt-1.5 text-sm text-ink">{summary}</p>
        </div>
      </div>
    </Card>
  );
}

function GlanceFallback() {
  return (
    <Card tone="accent">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pill bg-paper-raised text-sage"
        >
          <Sparkles size={18} strokeWidth={1.9} />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-ink">
            Your home at a glance
          </h2>
          <p className="mt-1.5 text-sm text-ink-soft">Reading through the file…</p>
        </div>
      </div>
    </Card>
  );
}

/* --- presentation ------------------------------------------------------- */

function HouseIllustration({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 112 80"
      aria-hidden
      className={`shrink-0 ${className}`}
      fill="none"
    >
      <circle cx="90" cy="18" r="11" className="fill-sage-soft" opacity="0.22" />
      <path
        d="M8 70h96"
        className="stroke-rule-strong"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M26 36v34h60V36"
        className="fill-paper-raised stroke-ink"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M14 40 56 8l42 32"
        className="stroke-ink"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M46 70V52h20v18"
        className="fill-sage-soft stroke-ink"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <rect
        x="33"
        y="44"
        width="10"
        height="10"
        rx="2"
        className="fill-sage-tint stroke-ink"
        strokeWidth="2.5"
      />
      <rect
        x="69"
        y="44"
        width="10"
        height="10"
        rx="2"
        className="fill-sage-tint stroke-ink"
        strokeWidth="2.5"
      />
    </svg>
  );
}

function contactInitial(label: string): string {
  const first = label.trim()[0];
  return first ? first.toUpperCase() : "?";
}

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
