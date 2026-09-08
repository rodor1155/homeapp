import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { Confidence } from "@/lib/document-types";

/* Shared building blocks for the "household ledger" system.
   Tokens + the CSS classes these lean on live in app/globals.css. */

/** The page shell: an ochre-bound content column. `center` for short pages. */
export function LedgerPage({
  children,
  size = "reading",
  center = false,
}: {
  children: ReactNode;
  size?: "reading" | "narrow";
  center?: boolean;
}) {
  const max = size === "narrow" ? "max-w-[27rem]" : "max-w-2xl";
  return (
    <div
      className={`mx-auto flex min-h-screen w-full max-w-3xl px-5 ${
        center ? "items-center py-10" : "items-start py-10 sm:py-16"
      }`}
    >
      <div className={`ledger-bound mx-auto w-full ${max}`}>{children}</div>
    </div>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-display italic text-ink-soft ${className}`}>
      homeapp
    </span>
  );
}

export function SectionHeading({
  children,
  aside,
}: {
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="ruled-row">
      <h2>{children}</h2>
      {aside ? (
        <span className="tnum shrink-0 text-xs text-ink-faint">{aside}</span>
      ) : null}
    </div>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "solid" | "quiet";
};

export function Button({ variant = "solid", className = "", ...props }: ButtonProps) {
  return (
    <button
      className={`${variant === "quiet" ? "btn-quiet" : "btn"} ${className}`}
      {...props}
    />
  );
}

export function Field({
  label,
  hint,
  note,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-center gap-2 text-sm text-ink-soft">
        {label}
        {hint ? <span className="font-normal text-ink-faint">{hint}</span> : null}
      </span>
      {children}
      {note ? <span className="margin-note">{note}</span> : null}
    </label>
  );
}

export function ConfidencePill({ level }: { level: Confidence }) {
  const word = level.charAt(0).toUpperCase() + level.slice(1);
  return <span className={`pill pill-${level}`}>{word}</span>;
}

type Tone = "filed" | "review" | "fault" | "ready" | "reading";

export const STATUS_META: Record<
  string,
  { label: string; tone: Tone }
> = {
  pending: { label: "Awaiting a read", tone: "reading" },
  processing: { label: "Reading it now", tone: "reading" },
  extracted: { label: "Ready to check", tone: "ready" },
  needs_review: { label: "Needs a look", tone: "review" },
  confirmed: { label: "Filed", tone: "filed" },
  failed: { label: "Couldn’t read it", tone: "fault" },
};

const TONE_MARK: Record<Tone, string> = {
  filed: "mark-filed",
  review: "mark-review",
  fault: "mark-fault",
  ready: "text-ink",
  reading: "mark-muted",
};

const TONE_EDGE: Record<Tone, string> = {
  filed: "entry--filed",
  review: "entry--review",
  fault: "entry--fault",
  ready: "",
  reading: "",
};

export function statusEdgeClass(status: string): string {
  return TONE_EDGE[STATUS_META[status]?.tone ?? "reading"];
}

export function StatusMark({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { label: status, tone: "reading" as Tone };
  return (
    <span className={`text-xs font-medium ${TONE_MARK[meta.tone]}`}>
      {meta.label}
    </span>
  );
}
