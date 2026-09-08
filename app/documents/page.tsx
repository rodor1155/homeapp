import Link from "next/link";
import DocumentsUploader from "./DocumentsUploader";
import DocumentsList from "./DocumentsList";
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

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-8 px-4 py-12">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Documents</h1>
          <p className="text-sm opacity-70">{property.address.split("\n")[0]}</p>
        </div>
        <Link href="/dashboard" className="text-sm underline opacity-70">
          Back to dashboard
        </Link>
      </header>

      <DocumentsUploader propertyId={property.id} />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium uppercase tracking-wide opacity-60">
          Uploaded ({documents.length})
        </h2>
        {documents.length === 0 ? (
          <p className="text-sm opacity-60">Nothing uploaded yet.</p>
        ) : (
          <DocumentsList documents={documents} />
        )}
      </section>
    </main>
  );
}
