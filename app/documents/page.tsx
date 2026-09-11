import Link from "next/link";
import { FilePlus2 } from "lucide-react";
import DocumentsUploader from "./DocumentsUploader";
import DocumentsList from "./DocumentsList";
import AppShell from "@/components/AppShell";
import ExportButton from "@/components/ExportButton";
import { Card, SectionHeading } from "@/components/ui";
import { getEntitlements, isBillingConfigured } from "@/lib/billing";
import { asCategory, effectiveCategory } from "@/lib/categories";
import { DOCUMENTS_SELECT, type DocumentRow } from "@/lib/document-types";
import { requireOnboarded } from "@/lib/household";

export const metadata = { title: "Documents · homeapp" };

function first(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { supabase, user, property, household } = await requireOnboarded();
  const billingConfigured = isBillingConfigured();
  const entitlements = await getEntitlements(household.id);

  const params = await searchParams;
  // Both come off a property-hub bucket: which one, and whether its + was used.
  const category = asCategory(first(params.category));
  const startUpload = first(params.upload) === "1";

  const { data } = await supabase
    .from("documents")
    .select(DOCUMENTS_SELECT)
    .eq("property_id", property.id)
    .order("created_at", { ascending: false });

  const all = (data as DocumentRow[] | null) ?? [];
  // Filtered here rather than in the query so a legacy row with no stored
  // category still shows up under its guess.
  const documents = category
    ? all.filter((doc) => effectiveCategory(doc) === category)
    : all;
  const count = documents.length;

  return (
    <AppShell user={user}>
      <div className="flex flex-col gap-4">
        <div className="flex items-end justify-between gap-3 px-1">
          <div className="min-w-0">
            <h1 className="text-2xl">Documents</h1>
            <p className="mt-0.5 truncate text-sm text-ink-soft">
              {property.address.split("\n")[0]}
            </p>
          </div>
          <ExportButton
            canExport={entitlements.canExport}
            billingConfigured={billingConfigured}
            variant="ghost"
            className="shrink-0"
          >
            Export
          </ExportButton>
        </div>

        <Card>
          <DocumentsUploader
            key={category ?? "all"}
            propertyId={property.id}
            initialCategory={category}
            focus={startUpload}
          />
        </Card>

        <div>
          <SectionHeading
            aside={
              count === 0
                ? undefined
                : `${count} ${count === 1 ? "entry" : "entries"}`
            }
          >
            {category ? category : "In your file"}
          </SectionHeading>

          {category ? (
            <p className="px-1 pb-2 text-xs text-ink-faint">
              Showing one category.{" "}
              <Link href="/documents" className="text-action text-xs">
                Show everything
              </Link>
            </p>
          ) : null}

          {count === 0 ? (
            <Card className="text-center">
              <span
                aria-hidden
                className="mx-auto flex h-12 w-12 items-center justify-center rounded-pill bg-sage-tint text-sage"
              >
                <FilePlus2 size={22} strokeWidth={1.8} />
              </span>
              <h3 className="mt-3 text-base font-semibold text-ink">
                {category ? `Nothing filed under ${category}` : "Nothing filed yet"}
              </h3>
              <p className="mx-auto mt-1.5 max-w-xs text-sm text-ink-soft">
                Add a PDF or a photo above and it will be read, sorted and
                filed for you.
              </p>
              <Link href="/dashboard" className="text-action mt-4 inline-block text-sm">
                Back to your home
              </Link>
            </Card>
          ) : (
            <Card padding="none">
              <DocumentsList documents={documents} />
            </Card>
          )}
        </div>
      </div>
    </AppShell>
  );
}
