"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Check } from "lucide-react";

export default function CopyButton({
  value,
  label = "Copy",
  className = "",
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const onCopy = useCallback(async () => {
    if (!value || !navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — no-op */
    }
  }, [value]);

  if (!value) return null;

  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label={copied ? "Copied" : label}
      className={`btn-quiet inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 px-2 text-xs ${className}`}
    >
      <span aria-live="polite" className="sr-only">
        {copied ? "Copied" : ""}
      </span>
      {copied ? (
        <>
          <Check size={14} aria-hidden />
          <span>Copied</span>
        </>
      ) : (
        <>
          <Copy size={14} aria-hidden />
          <span>{label}</span>
        </>
      )}
    </button>
  );
}
