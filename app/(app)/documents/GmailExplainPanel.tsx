"use client";

import { useTransition } from "react";
import { DoorOpen, Lock, Search } from "lucide-react";
import { Button } from "@/components/ui";

const STEPS = [
  {
    title: "homeapp scans your inbox",
    body: "A secure scan looks back through the last 12 months to spot household PDFs.",
  },
  {
    title: "homeapp categorises found PDFs",
    body: "We sort what we find — from car insurance to utility bills — into your house file.",
  },
  {
    title: "You choose what to import",
    body: "Nothing is stored until you review and confirm each document.",
  },
];

export default function GmailExplainPanel({
  configured,
  connectedEmail,
  onBack,
  onScan,
  scanning,
}: {
  configured: boolean;
  connectedEmail: string | null;
  onBack: () => void;
  onScan: () => void;
  scanning: boolean;
}) {
  const [, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-5 pb-2">
      <ol className="flex flex-col gap-3">
        {STEPS.map((step, i) => (
          <li
            key={step.title}
            className="flex gap-3 rounded-lg border border-rule bg-paper p-3.5"
          >
            <span
              aria-hidden
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-pill bg-ochre-tint text-sm font-semibold text-ochre"
            >
              {i + 1}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">{step.title}</p>
              <p className="mt-1 text-sm text-ink-soft">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="flex flex-col items-center gap-1.5 px-1">
          <Search size={18} className="text-sage" aria-hidden />
          <span className="text-xs text-ink-faint">Read-only access</span>
        </div>
        <div className="flex flex-col items-center gap-1.5 px-1">
          <Lock size={18} className="text-sage" aria-hidden />
          <span className="text-xs text-ink-faint">Secure storage</span>
        </div>
        <div className="flex flex-col items-center gap-1.5 px-1">
          <DoorOpen size={18} className="text-sage" aria-hidden />
          <span className="text-xs text-ink-faint">Disconnect any time</span>
        </div>
      </div>

      {!configured ? (
        <p className="rounded-lg border border-rule bg-paper-sunk px-3 py-2.5 text-sm text-ink-soft">
          Gmail import is not set up on this deployment yet. Ask the person who
          runs homeapp to add Google OAuth credentials.
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        {connectedEmail ? (
          <Button
            type="button"
            disabled={scanning || !configured}
            onClick={() => startTransition(onScan)}
            className="w-full"
          >
            {scanning ? "Scanning Gmail…" : "Scan Gmail for documents"}
          </Button>
        ) : configured ? (
          <a
            href="/api/gmail/connect"
            className="btn w-full text-center no-underline"
          >
            Connect Gmail and scan
          </a>
        ) : (
          <Button type="button" disabled className="w-full">
            Connect Gmail and scan
          </Button>
        )}
        <Button type="button" variant="quiet" onClick={onBack} className="w-full">
          Back
        </Button>
      </div>

      <p className="text-center text-xs text-ink-faint">
        By continuing, you give homeapp read-only access to Gmail to scan for
        household documents.
      </p>
    </div>
  );
}
