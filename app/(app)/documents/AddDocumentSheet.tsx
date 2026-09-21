"use client";

import { useRef, useState, useTransition } from "react";
import {
  Camera,
  ChevronDown,
  Cloud,
  FolderOpen,
  Mail,
  Share2,
} from "lucide-react";
import BottomSheet from "@/components/BottomSheet";
import { CATEGORIES, type Category } from "@/lib/categories";
import GmailExplainPanel from "./GmailExplainPanel";
import GmailImportReview, { type GmailCandidate } from "./GmailImportReview";
import { useDocumentUpload } from "./useDocumentUpload";
import {
  disconnectGmailAccount,
  scanGmailInbox,
} from "@/app/actions/gmail";

const ACCEPT = "application/pdf,image/*";

type SheetStep = "add" | "gmail-explain" | "gmail-review";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
      {children}
    </p>
  );
}

function ImportTile({
  icon,
  label,
  onClick,
  disabled,
  soon,
  className = "",
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  soon?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || soon}
      className={`flex min-h-[4.5rem] flex-col items-center justify-center gap-2 rounded-lg border border-rule bg-ink px-3 py-3 text-center text-sm font-semibold text-paper-raised transition-colors disabled:opacity-45 ${className}`}
    >
      {icon}
      <span>{soon ? `${label} (soon)` : label}</span>
    </button>
  );
}

function StubRow({
  icon,
  label,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  detail: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-rule bg-paper-raised">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
      >
        <span className="text-ink-soft">{icon}</span>
        <span className="flex-1 text-sm font-medium text-ink">{label}</span>
        <ChevronDown
          size={18}
          className={`shrink-0 text-ink-faint transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {open ? (
        <p className="border-t border-rule px-4 py-3 text-sm text-ink-soft">
          {detail}
        </p>
      ) : null}
    </div>
  );
}

export default function AddDocumentSheet({
  open,
  onClose,
  propertyId,
  locale,
  initialCategory = null,
  gmailConfigured,
  gmailConnection,
  gmailCandidates,
  initialStep = "add",
  statusMessage,
}: {
  open: boolean;
  onClose: () => void;
  propertyId: string;
  locale: "UK" | "US";
  initialCategory?: Category | null;
  gmailConfigured: boolean;
  gmailConnection: {
    gmailAddress: string;
    lastScanError: string | null;
  } | null;
  gmailCandidates: GmailCandidate[];
  initialStep?: SheetStep;
  statusMessage?: string | null;
}) {
  return open ? (
    <AddDocumentSheetBody
      key={`${initialStep}-${statusMessage ?? ""}-${initialCategory ?? "all"}`}
      onClose={onClose}
      propertyId={propertyId}
      locale={locale}
      initialCategory={initialCategory}
      gmailConfigured={gmailConfigured}
      gmailConnection={gmailConnection}
      gmailCandidates={gmailCandidates}
      initialStep={initialStep}
      statusMessage={statusMessage}
    />
  ) : null;
}

function AddDocumentSheetBody({
  onClose,
  propertyId,
  locale,
  initialCategory = null,
  gmailConfigured,
  gmailConnection,
  gmailCandidates,
  initialStep = "add",
  statusMessage,
}: {
  onClose: () => void;
  propertyId: string;
  locale: "UK" | "US";
  initialCategory?: Category | null;
  gmailConfigured: boolean;
  gmailConnection: {
    gmailAddress: string;
    lastScanError: string | null;
  } | null;
  gmailCandidates: GmailCandidate[];
  initialStep?: SheetStep;
  statusMessage?: string | null;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<SheetStep>(initialStep);
  const [category, setCategory] = useState<Category | "">(initialCategory ?? "");
  const [banner, setBanner] = useState<string | null>(statusMessage ?? null);
  const [pending, startTransition] = useTransition();

  const { uploadFiles, busy, error, done } = useDocumentUpload(propertyId, category);

  const title =
    step === "gmail-explain"
      ? "Find documents in your Gmail"
      : step === "gmail-review"
        ? "Review Gmail imports"
        : "Add a document";

  function closeSheet() {
    onClose();
  }

  function afterUpload() {
    closeSheet();
  }

  function handleScan() {
    setBanner(null);
    startTransition(async () => {
      const result = await scanGmailInbox();
      if (result.error) {
        setBanner(result.error);
        return;
      }
      setStep("gmail-review");
      setBanner(
        (result.count ?? 0) > 0
          ? `Found ${result.count} PDFs to review.`
          : "Scan complete — review anything we found, or try again later."
      );
    });
  }

  function handleDisconnect() {
    startTransition(async () => {
      const result = await disconnectGmailAccount();
      if (result.error) setBanner(result.error);
      else setBanner("Gmail disconnected.");
    });
  }

  let body: React.ReactNode;

  if (step === "gmail-explain") {
    body = (
      <GmailExplainPanel
        configured={gmailConfigured}
        connectedEmail={gmailConnection?.gmailAddress ?? null}
        onBack={() => setStep("add")}
        onScan={handleScan}
        scanning={pending}
      />
    );
  } else if (step === "gmail-review") {
    body = (
      <GmailImportReview
        key={gmailCandidates.map((c) => c.id).join(",")}
        candidates={gmailCandidates}
        locale={locale}
        onBack={() => setStep("add")}
        onImported={closeSheet}
      />
    );
  } else {
    body = (
      <div className="flex flex-col gap-5 pb-2">
        {banner ? (
          <p className="rounded-lg border border-rule bg-paper-sunk px-3 py-2 text-sm text-ink-soft">
            {banner}
          </p>
        ) : null}

        <label className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-ink-soft">File it under</span>
          <select
            value={category}
            disabled={busy}
            onChange={(e) => setCategory(e.target.value as Category | "")}
            className="field-input w-auto"
          >
            <option value="">Let us sort it</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <section className="flex flex-col gap-2">
          <SectionLabel>Auto-import (recommended)</SectionLabel>
          <p className="text-sm text-ink-soft">
            Safely sync, review, and import your paperwork directly.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <ImportTile
              icon={
                <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
              }
              label={gmailConnection ? "Gmail connected" : "Connect Gmail"}
              onClick={() => setStep("gmail-explain")}
            />
            <ImportTile
              icon={
                <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
                  <path
                    fill="currentColor"
                    d="M11.4 24H0V12.6h11.4V24zM24 24H12.6V12.6H24V24zM11.4 11.4H0V0h11.4v11.4zm12.6 0H12.6V0H24v11.4z"
                  />
                </svg>
              }
              label="Connect Outlook"
              soon
            />
          </div>
          {gmailConnection ? (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-faint">
              <span>{gmailConnection.gmailAddress}</span>
              <div className="flex gap-3">
                {gmailCandidates.length > 0 ? (
                  <button
                    type="button"
                    className="text-action"
                    onClick={() => setStep("gmail-review")}
                  >
                    Review {gmailCandidates.length} found
                  </button>
                ) : null}
                <button
                  type="button"
                  className="text-action"
                  onClick={handleDisconnect}
                  disabled={pending}
                >
                  Disconnect
                </button>
              </div>
            </div>
          ) : null}
          <button
            type="button"
            className="text-action mx-auto text-sm"
            onClick={() => setStep("gmail-explain")}
          >
            How does this work?
          </button>
        </section>

        <section className="flex flex-col gap-2">
          <SectionLabel>Manual upload</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            <ImportTile
              icon={<Camera size={20} aria-hidden />}
              label="Take photo"
              disabled={busy}
              onClick={() => cameraInputRef.current?.click()}
            />
            <ImportTile
              icon={<FolderOpen size={20} aria-hidden />}
              label="Browse files"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
            />
          </div>
          <ImportTile
            icon={<Cloud size={20} aria-hidden />}
            label="Upload from cloud storage"
            soon
            className="min-h-[4rem] w-full flex-row justify-start gap-3 px-4 text-left"
          />
          <p className="text-xs text-ink-faint">
            Google Drive, Dropbox, iCloud &amp; more — coming soon.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <StubRow
            icon={<Share2 size={18} aria-hidden />}
            label="Share from other apps"
            detail="Send a PDF from another app into Hearth Home using your phone’s share sheet. Coming soon."
          />
          <StubRow
            icon={<Mail size={18} aria-hidden />}
            label="Email to Hearth Home"
            detail="Forward household paperwork to a Hearth Home address and we’ll file it for you. Coming soon."
          />
        </section>

        {busy ? (
          <p className="text-xs text-ink-faint">Uploaded {done} so far…</p>
        ) : null}
        {error ? <p className="text-xs mark-fault">{error}</p> : null}

        <p className="text-center text-xs text-ink-faint">
          P.S. Hearth Home is your home’s filing assistant — please stick to
          home-related paperwork rather than personal medical documents.
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT}
          multiple
          hidden
          onChange={(e) => {
            void uploadFiles(Array.from(e.target.files ?? []), afterUpload);
            e.target.value = "";
          }}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            void uploadFiles(Array.from(e.target.files ?? []), afterUpload);
            e.target.value = "";
          }}
        />
      </div>
    );
  }

  return (
    <BottomSheet open onClose={closeSheet} title={title}>
      {body}
    </BottomSheet>
  );
}
