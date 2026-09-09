import Link from "next/link";
import DocumentsUploader from "./DocumentsUploader";
import DocumentsList from "./DocumentsList";
import { LedgerPage, SectionHeading, Wordmark } from "@/components/ui";
import { DOCUMENTS_SELECT, type DocumentRow } from "@/lib/document-types";
import { requireOnboarded } from "@/lib/household";

export const metadata = { title: "Documents · homeapp" };

export default async function DocumentsPage() {
  const { supabase, property } = await requireOnboarded();

  const { data } = await supabase
    .from("documents")
    .select(DOCUMENTS_SELECT)
    .eq("property_id", property.id)
    .order("created_at", { ascending: false });

  const documents = (data as DocumentRow[] | null) ?? [];
  const count = documents.length;

  return (
    <LedgerPage>
      <div className="flex items-start justify-between gap-4">
        <Wordmark className="text-sm" />
        <Link href="/dashboard" className="text-action text-sm">
          Dashboard
        </Link>
      </div>

      <header className="mt-6 flex items-end justify-between gap-4 border-b border-rule pb-5">
        <div>
          <h1 className="text-2xl">Documents</h1>
          <p className="mt-1.5 text-sm text-ink-soft">
            {property.address.split("\n")[0]}
          </p>
        </div>
        <a href="/api/export" className="text-action shrink-0 text-sm">
          Export everything
        </a>
      </header>

      <div className="mt-8">
        <DocumentsUploader propertyId={property.id} />
      </div>

      <section className="mt-10">
        <SectionHeading
          aside={count === 0 ? undefined : `${count} ${count === 1 ? "entry" : "entries"}`}
        >
          In your file
        </SectionHeading>
        <div className="mt-4">
          {count === 0 ? (
            <p className="text-sm text-ink-faint">
              Nothing filed yet. Add a document above to get started.
            </p>
          ) : (
            <DocumentsList documents={documents} />
          )}
        </div>
      </section>
    </LedgerPage>
  );
}
