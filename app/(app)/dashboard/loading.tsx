/** Home tab skeleton — matches map + deck layout to avoid pop-in. */
export default function DashboardLoading() {
  return (
    <div
      role="status"
      aria-label="Loading home"
      aria-busy="true"
      className="evening-map-screen"
    >
      <div aria-hidden className="evening-map-layer evening-map-fallback atlas-skeleton-shimmer" />
      <div aria-hidden className="evening-map-scrim-top" />
      <div aria-hidden className="evening-map-scrim-bottom" />
      <div className="evening-map-chrome">
        <header className="px-4 pb-2 pt-3">
          <div className="atlas-skeleton-line h-8 w-48 max-w-full" />
          <div className="atlas-skeleton-line mt-2 h-3 w-56 max-w-full" />
        </header>
        <div className="evening-card-stack mt-auto px-4 pb-2">
          <div className="evening-deck atlas-deck-skeleton-stage">
            <div className="atlas-deck-skeleton-card atlas-fill-navy atlas-skeleton-shimmer" />
          </div>
        </div>
      </div>
    </div>
  );
}
