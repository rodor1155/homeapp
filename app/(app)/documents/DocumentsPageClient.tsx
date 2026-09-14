"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import AddDocumentSheet from "./AddDocumentSheet";
import type { GmailCandidate } from "./GmailImportReview";
import { Button } from "@/components/ui";
import type { Category } from "@/lib/categories";
import { scanGmailInbox } from "@/app/actions/gmail";

type SheetStep = "add" | "gmail-explain" | "gmail-review";

export default function DocumentsPageClient({
  propertyId,
  locale,
  initialCategory,
  startUpload,
  gmailFlow,
  gmailMessage,
  gmailConfigured,
  gmailConnection,
  gmailCandidates,
  addressLine,
  headerActions,
}: {
  propertyId: string;
  locale: "UK" | "US";
  initialCategory: Category | null;
  startUpload: boolean;
  gmailFlow: "connected" | "error" | "setup" | null;
  gmailMessage: string | null;
  gmailConfigured: boolean;
  gmailConnection: {
    gmailAddress: string;
    lastScanError: string | null;
  } | null;
  gmailCandidates: GmailCandidate[];
  addressLine: string;
  headerActions: React.ReactNode;
}) {
  const router = useRouter();
  const scanned = useRef(false);

  const [open, setOpen] = useState(startUpload || gmailFlow !== null);
  const [step, setStep] = useState<SheetStep>(
    gmailFlow ? "gmail-explain" : "add"
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(
    gmailFlow === "connected"
      ? "Gmail connected. Scanning your inbox…"
      : gmailMessage
  );
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (gmailFlow) {
      router.replace("/documents");
    }
  }, [gmailFlow, router]);

  useEffect(() => {
    if (gmailFlow !== "connected" || scanned.current) return;
    scanned.current = true;
    startTransition(async () => {
      const result = await scanGmailInbox();
      router.refresh();
      if (result.error) {
        setStatusMessage(result.error);
        return;
      }
      setStep("gmail-review");
      setStatusMessage(
        (result.count ?? 0) > 0
          ? `Found ${result.count} PDFs to review.`
          : "Scan complete — review anything we found, or try again later."
      );
    });
  }, [gmailFlow, router]);

  return (
    <>
      <div className="px-1">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl">Documents</h1>
            <p className="mt-0.5 truncate text-sm text-ink-soft">{addressLine}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {headerActions}
            <Button
              type="button"
              variant="solid"
              className="gap-1.5"
              onClick={() => {
                setStep("add");
                setStatusMessage(null);
                setOpen(true);
              }}
            >
              <Plus size={18} aria-hidden />
              Add
            </Button>
          </div>
        </div>
      </div>

      <AddDocumentSheet
        open={open}
        onClose={() => setOpen(false)}
        propertyId={propertyId}
        locale={locale}
        initialCategory={initialCategory}
        gmailConfigured={gmailConfigured}
        gmailConnection={gmailConnection}
        gmailCandidates={gmailCandidates}
        initialStep={step}
        statusMessage={statusMessage}
      />
    </>
  );
}
