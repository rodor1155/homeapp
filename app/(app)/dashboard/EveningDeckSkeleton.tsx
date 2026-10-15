"use client";

/** Placeholder fan while vault deck rows resolve on the client. */
export default function EveningDeckSkeleton() {
  return (
    <div className="evening-card-stack" aria-hidden>
      <div className="evening-deck-toolbar">
        <div className="evening-deck-toolbar-actions">
          <span className="evening-deck-shuffle atlas-skeleton-pill h-10 w-10" />
          <span className="evening-deck-see-all-pill atlas-skeleton-pill h-10 w-28" />
        </div>
      </div>
      <div className="evening-deck atlas-deck-skeleton-stage">
        <div className="atlas-deck-skeleton-card atlas-fill-slate atlas-skeleton-shimmer" />
        <div className="atlas-deck-skeleton-card atlas-fill-navy atlas-skeleton-shimmer atlas-deck-skeleton-card--back" />
      </div>
    </div>
  );
}
