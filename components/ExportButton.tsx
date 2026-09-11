"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui";

type Props = {
  canExport: boolean;
  billingConfigured: boolean;
  variant?: "solid" | "quiet" | "ghost";
  className?: string;
  /** Where helper text sits relative to the button. */
  align?: "start" | "end";
  children: React.ReactNode;
};

export default function ExportButton({
  canExport,
  billingConfigured,
  variant = "ghost",
  className = "",
  align = "end",
  children,
}: Props) {
  const alignClass = align === "start" ? "items-start" : "items-end";
  const textAlign = align === "start" ? "text-left" : "text-right";
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!billingConfigured || canExport) {
    return (
      <ExportTrigger
        variant={variant}
        className={className}
        alignClass={alignClass}
        textAlign={textAlign}
        pending={pending}
        error={error}
        onExport={() => downloadExport(setPending, setError)}
      >
        {children}
      </ExportTrigger>
    );
  }

  return (
    <div className={`flex flex-col gap-1 ${alignClass} ${className}`}>
      <p className={`text-sm ${textAlign}`}>
        <span className="text-ink-soft">{children}</span>
        <span className="mark-review">
          {" "}
          — Export is a paid feature.{" "}
          <Link
            href="/settings"
            className="text-action underline-offset-2 hover:underline"
          >
            Upgrade in Settings
          </Link>{" "}
          to download your documents.
        </span>
      </p>
    </div>
  );
}

function ExportTrigger({
  variant,
  className,
  alignClass,
  textAlign,
  pending,
  error,
  onExport,
  children,
}: {
  variant: "solid" | "quiet" | "ghost";
  className: string;
  alignClass: string;
  textAlign: string;
  pending: boolean;
  error: string | null;
  onExport: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${alignClass} ${className}`}>
      <Button
        type="button"
        variant={variant}
        disabled={pending}
        onClick={onExport}
      >
        {pending ? "Preparing…" : children}
      </Button>
      {error ? (
        <p className={`max-w-xs text-xs mark-fault ${textAlign}`}>
          {error}{" "}
          {error.includes("paid feature") ? (
            <Link
              href="/settings"
              className="text-action underline-offset-2 hover:underline"
            >
              Upgrade in Settings
            </Link>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

async function downloadExport(
  setPending: (value: boolean) => void,
  setError: (value: string | null) => void
) {
  setPending(true);
  setError(null);

  try {
    const response = await fetch("/api/export");

    if (response.status === 402) {
      setError(
        "Export is a paid feature. Upgrade in Settings to download your documents."
      );
      return;
    }

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      setError(payload.error ?? "Export failed. Please try again.");
      return;
    }

    const blob = await response.blob();
    const today = new Date().toISOString().slice(0, 10);
    const filename =
      parseFilename(response.headers.get("Content-Disposition")) ??
      `homeapp-export-${today}.zip`;

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  } catch {
    setError("Could not reach the export service. Please try again.");
  } finally {
    setPending(false);
  }
}

function parseFilename(header: string | null): string | null {
  if (!header) return null;
  const match = /filename="([^"]+)"/i.exec(header);
  return match?.[1] ?? null;
}
