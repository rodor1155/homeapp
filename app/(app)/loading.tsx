/**
 * What a tab shows between the tap and the page. Deliberately vague — a
 * heading, a line of standfirst and three cards, the rhythm every screen in
 * the group shares — so it reads as the page arriving rather than as a
 * different screen.
 */
export default function AppLoading() {
  return (
    <div
      role="status"
      aria-label="Loading"
      aria-busy="true"
      className="flex animate-pulse flex-col gap-4"
    >
      <div className="px-1">
        <Bar className="h-7 w-40" />
        <Bar className="mt-2 h-4 w-64" />
      </div>

      {[0, 1, 2].map((card) => (
        <div key={card} className="card p-4">
          <Bar className="h-4 w-28" />
          <div className="mt-4 flex flex-col gap-3">
            {[0, 1, 2].map((row) => (
              <div key={row} className="flex items-center gap-3">
                <span className="h-9 w-9 shrink-0 rounded-pill bg-paper-sunk" />
                <div className="min-w-0 flex-1">
                  <Bar className="h-3.5 w-2/5" />
                  <Bar className="mt-1.5 h-3 w-3/5" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Bar({ className }: { className?: string }) {
  return <span className={`block max-w-full rounded-sm bg-paper-sunk ${className ?? ""}`} />;
}
