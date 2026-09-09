import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { Confidence } from "@/lib/document-types";

/* Shared building blocks for the card system.
   Tokens + the CSS classes these lean on live in app/globals.css. */

/** A plain centred content column on the page ground. Used by the screens
 *  outside the app shell (and kept for anything still reaching for it). */
export function LedgerPage({
  children,
  size = "reading",
  center = false,
}: {
  children: ReactNode;
  size?: "reading" | "narrow";
  center?: boolean;
}) {
  const max = size === "narrow" ? "max-w-[27rem]" : "max-w-xl";
  return (
    <div
      className={`mx-auto flex min-h-screen w-full max-w-3xl px-4 ${
        center ? "items-center py-10" : "items-start py-8 sm:py-14"
      }`}
    >
      <div className={`mx-auto w-full ${max}`}>{children}</div>
    </div>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-display font-medium italic text-ink ${className}`}>
      homeapp
    </span>
  );
}

/** A label sitting above a card, with an optional right-hand aside. */
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

/**
 * The white rounded panel everything sits in.
 * `tone="accent"` gives the soft sage wash; `padding="none"` lets a list run
 * to the card's edges (pair it with the card's own overflow clipping).
 */
export function Card({
  children,
  title,
  action,
  tone = "plain",
  padding = "normal",
  className = "",
}: {
  children: ReactNode;
  title?: ReactNode;
  action?: ReactNode;
  tone?: "plain" | "accent";
  padding?: "normal" | "none";
  className?: string;
}) {
  const hasHeader = Boolean(title || action);
  const pad = padding === "none" ? "" : "p-4 sm:p-5";

  return (
    <section
      className={`card overflow-hidden ${
        tone === "accent" ? "card-accent" : ""
      } ${pad} ${className}`}
    >
      {hasHeader ? (
        <div className="mb-3 flex items-baseline justify-between gap-3">
          {title ? (
            <h2 className="text-base font-semibold text-ink">{title}</h2>
          ) : (
            <span />
          )}
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "solid" | "quiet" | "ghost";
};

const BUTTON_CLASS: Record<NonNullable<ButtonProps["variant"]>, string> = {
  solid: "btn",
  quiet: "btn-quiet",
  ghost: "btn-ghost",
};

export function Button({ variant = "solid", className = "", ...props }: ButtonProps) {
  return (
    <button className={`${BUTTON_CLASS[variant]} ${className}`} {...props} />
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
      <span className="flex items-center gap-2 text-sm font-medium text-ink-soft">
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
