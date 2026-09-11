import Link from "next/link";
import { CATEGORY_ICON } from "@/components/category-icons";
import { Card, statusEdgeClass } from "@/components/ui";
import { formatDate, intlLocale } from "@/lib/dates";
import type { Locale } from "@/lib/household";
import {
  contacts,
  documentLabel,
  groupByCategory,
  nextDate,
  parseAmount,
  spendByCurrency,
  type OverviewDocument,
} from "@/lib/home-overview";
import HouseIllustration from "./HouseIllustration";
import { loadOverviewDocuments } from "./overview-data";

export default async function FilingSection({
  householdId,
  locale,
}: {
  householdId: string;
  locale: Locale;
}) {
  const documents = await loadOverviewDocuments(householdId);
  const categories = groupByCategory(documents);
  const totals = spendByCurrency(documents);
  const keyContacts = contacts(documents);

  if (documents.length === 0) {
    return (
      <Card className="text-center">
        <HouseIllustration className="mx-auto h-24 w-32" />
        <h2 className="mt-3 text-lg">Nothing filed yet</h2>
        <p className="mx-auto mt-2 max-w-xs text-sm text-ink-soft">
          Once a document has been read, this page fills in with what is
          coming up, what it costs and who to call.
        </p>
        <Link href="/documents?upload=1#upload" className="btn mt-5">
          Add a document
        </Link>
      </Card>
    );
  }

  return (
    <>
      {categories.map((group) => {
        const Icon = CATEGORY_ICON[group.category];
        return (
          <Card key={group.category} padding="none">
            <Link
              href={`/documents?category=${encodeURIComponent(group.category)}`}
              className="flex items-center gap-2.5 px-4 pb-2.5 pt-4"
            >
              <span aria-hidden className="text-sage">
                <Icon size={16} strokeWidth={2} />
              </span>
              <h3 className="text-sm font-semibold text-ink">{group.category}</h3>
              <span className="tnum ml-auto text-xs text-ink-faint">
                {group.documents.length}
              </span>
            </Link>
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
                    <p className="text-xs text-ink-faint">{doc.doc_type}</p>
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
        {keyContacts.length === 0 ? (
          <p className="text-sm text-ink-faint">
            No names or numbers have turned up yet.
          </p>
        ) : (
          <ul className="divide-y divide-rule">
            {keyContacts.map((contact, i) => (
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
  );
}

function contactInitial(label: string): string {
  const letter = label.trim().charAt(0);
  return letter ? letter.toUpperCase() : "?";
}

function RowMeta({ doc, locale }: { doc: OverviewDocument; locale: Locale }) {
  const amount = parseAmount(doc.amount);
  const when = nextDate(doc);
  const bits = [
    amount != null && doc.currency
      ? formatMoney(amount, doc.currency, locale)
      : null,
    when ? formatDate(when, locale) : null,
  ].filter(Boolean);
  if (bits.length === 0) return null;
  return <p className="mt-0.5 text-xs text-ink-faint">{bits.join(" · ")}</p>;
}

function formatMoney(amount: number, currency: string, locale: Locale): string {
  try {
    return new Intl.NumberFormat(intlLocale(locale), {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}
