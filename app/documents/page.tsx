import Link from "next/link";
import DocumentsUploader from "./DocumentsUploader";
import { requireOnboarded } from "@/lib/household";

export const metadata = { title: "Documents · homeapp" };

type DocumentRow = {
  id: string;
  original_filename: string;
  created_at: string;
  extraction_status: string;
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function DocumentsPage() {
  const { supabase, household, property } = await requireOnboarded();

  const { data } = await supabase
    .from("documents")
    .select("id, original_filename, created_at, extraction_status")
    .eq("household_id", household.id)
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

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium uppercase tracking-wide opacity-60">
          Uploaded ({documents.length})
        </h2>
        {documents.length === 0 ? (
          <p className="text-sm opacity-60">Nothing uploaded yet.</p>
        ) : (
          <ul className="divide-y divide-black/10 rounded-lg border border-black/10 dark:divide-white/10 dark:border-white/15">
            {documents.map((doc) => (
              <li
                key={doc.id}
                className="flex items-center justify-between gap-4 px-4 py-3 text-sm"
              >
                <span className="min-w-0 flex-1 truncate">
                  {doc.original_filename}
                </span>
                <span className="shrink-0 opacity-60">
                  {formatDate(doc.created_at)}
                </span>
                <span className="shrink-0 rounded-full border border-black/15 px-2 py-0.5 text-xs capitalize opacity-70 dark:border-white/20">
                  {doc.extraction_status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
