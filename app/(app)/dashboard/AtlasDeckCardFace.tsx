"use client";

import { ArrowUpRight, CalendarPlus } from "lucide-react";
import type { ReactNode } from "react";
import { ATLAS_COLOR_CLASS, type AtlasCardColor } from "@/lib/atlas-colors";

export default function AtlasDeckCardFace({
  color,
  eyebrow,
  title,
  badge,
  whenLabel,
  position,
  total,
  bookLabel,
  onBook,
  onOpen,
  openLabel = "Open record",
  interactive = true,
}: {
  color: AtlasCardColor;
  eyebrow: string;
  title: string;
  badge?: string;
  whenLabel: string;
  position?: number;
  total?: number;
  bookLabel?: string | null;
  onBook?: () => void;
  onOpen?: () => void;
  openLabel?: string;
  /** When false, buttons are omitted (peek cards). */
  interactive?: boolean;
}) {
  const fillClass = ATLAS_COLOR_CLASS[color];

  let actions: ReactNode = null;
  if (interactive && (onBook || onOpen)) {
    actions = (
      <div className="atlas-card-actions">
        {bookLabel && onBook ? (
          <button type="button" className="atlas-btn atlas-btn--book" onClick={onBook}>
            <CalendarPlus size={18} strokeWidth={2.1} aria-hidden />
            {bookLabel}
          </button>
        ) : null}
        {onOpen ? (
          <button type="button" className="atlas-btn atlas-btn--open" onClick={onOpen}>
            {openLabel}
            <ArrowUpRight size={18} strokeWidth={2.1} aria-hidden />
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className={`atlas-card-inner ${fillClass}`}>
      <div className="atlas-card-top">
        <p className="atlas-card-eyebrow tnum">{eyebrow}</p>
        {position != null && total != null && total > 0 ? (
          <span className="atlas-card-index tnum" aria-hidden>
            {position} / {total}
          </span>
        ) : null}
      </div>
      <h2 className="atlas-card-title">{title}</h2>
      <div className="atlas-card-meta-row">
        {badge ? <span className="atlas-plate tnum">{badge}</span> : null}
        <span className="atlas-card-when tnum">{whenLabel}</span>
      </div>
      {actions}
    </div>
  );
}
