import Link from "next/link";
import { Suspense } from "react";
import { FilePlus2 } from "lucide-react";
import DocumentsList from "./DocumentsList";
import DocumentsPageClient from "./DocumentsPageClient";
import ExportButton from "@/components/ExportButton";
import { Card, SectionHeading } from "@/components/ui";
import { getEntitlements, isBillingConfigured } from "@/lib/billing";
import { asCategory, effectiveCategory } from "@/lib/categories";
import { DOCUMENTS_SELECT, type DocumentRow } from "@/lib/document-types";
import { loadHouseholdPeople } from "@/lib/family";
import { loadRenewalItems, renewalByDocumentId } from "@/lib/renewals";
import { isGmailConfigured } from "@/lib/gmail-config";
import { loadGmailConnectionPublic, loadPendingCandidates } from "@/lib/gmail";
import { requireOnboarded } from "@/lib/household";
import { appTitle } from "@/lib/brand";
import MaintenanceSection from "../dashboard/MaintenanceSection";

export const metadata = { title: appTitle("Documents") };

function first(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { supabase, property, household } = await requireOnboarded();
  const billingConfigured = isBillingConfigured();
  const gmailConfigured = isGmailConfigured();

  const params = await searchParams;
  const category = asCategory(first(params.category));
  const startUpload = first(params.upload) === "1";
  const gmailFlow = first(params.gmail);
  const gmailMessage = first(params.message);

  const [
    entitlements,
    { data },
    gmailConnection,
    gmailCandidates,
    peopleLoad,
    renewalsLoad,
  ] = await Promise.all([
    getEntitlements(household.id),
    supabase
      .from("documents")
      .select(DOCUMENTS_SELECT)
      .eq("property_id", property.id)
      .order("created_at", { ascending: false }),
    loadGmailConnectionPublic(household.id),
    loadPendingCandidates(household.id),
    loadHouseholdPeople(supabase, household.id),
    loadRenewalItems(supabase, household.id),
  ]);

  const all = (data as DocumentRow[] | null) ?? [];
  const documents = category
    ? all.filter((doc) => effectiveCategory(doc) === category)
    : all;
  const count = documents.length;
  const renewalLinks = renewalByDocumentId(renewalsLoad.items);
  const docOptions = all.map((doc) => ({
    id: doc.id,
    original_filename: doc.original_filename,
    category: doc.category,
  }));

  const gmailCandidatesPublic = gmailCandidates.map((c) => ({
    id: c.id,
    filename: c.filename,
    subject: c.subject,
    sender: c.sender,
    received_at: c.received_at,
    suggested_category: c.suggested_category,
  }));

  return (
    <div className="flex flex-col gap-4">
      <Suspense fallback={null}>
        <DocumentsPageClient
          propertyId={property.id}
          locale={household.locale ?? "UK"}
          initialCategory={category}
          startUpload={startUpload}
          gmailFlow={
            gmailFlow === "connected" ||
            gmailFlow === "error" ||
            gmailFlow === "setup"
              ? gmailFlow
              : null
          }
          gmailMessage={gmailMessage}
          gmailConfigured={gmailConfigured}
          gmailConnection={
            gmailConnection
              ? {
                  gmailAddress: gmailConnection.gmailAddress,
                  lastScanError: gmailConnection.lastScanError,
                }
              : null
          }
          gmailCandidates={gmailCandidatesPublic}
          addressLine={property.address.split("\n")[0]}
          headerActions={
            <ExportButton
              canExport={entitlements.canExport}
              billingConfigured={billingConfigured}
              variant="ghost"
            >
              Export
            </ExportButton>
          }
        />
      </Suspense>

      {!category ? (
        <Suspense fallback={null}>
          <MaintenanceSection
            householdId={household.id}
            locale={household.locale ?? "UK"}
          />
        </Suspense>
      ) : null}

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
              Tap Add to upload a PDF or photo, or connect Gmail to import
              paperwork you already have.
            </p>
            <Link href="/dashboard" className="text-action mt-4 inline-block text-sm">
              Back to your home
            </Link>
          </Card>
        ) : (
          <Card padding="none">
            <DocumentsList
              documents={documents}
              renewalByDocument={renewalLinks}
              people={peopleLoad.items}
              docOptions={docOptions}
              locale={household.locale ?? "UK"}
            />
          </Card>
        )}
      </div>
    </div>
  );
}
