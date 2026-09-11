import { Sparkles } from "lucide-react";
import { Card } from "@/components/ui";
import { CATEGORIES } from "@/lib/categories";

/* What each section of the home screen holds while its own reads come back.
   Same language as app/(app)/loading.tsx — paper-sunk bars pulsing quietly on
   a card — and roughly the height of the thing that replaces it, so the page
   settles rather than jumps. A section that knows its heading says it. */

function Bar({ className = "" }: { className?: string }) {
  return (
    <span className={`block max-w-full rounded-sm bg-paper-sunk ${className}`} />
  );
}

function Rows({ count = 3 }: { count?: number }) {
  return (
    <div className="flex animate-pulse flex-col gap-3">
      {Array.from({ length: count }, (_, row) => (
        <div key={row} className="flex items-center gap-3">
          <span className="h-9 w-9 shrink-0 rounded-pill bg-paper-sunk" />
          <div className="min-w-0 flex-1">
            <Bar className="h-3.5 w-2/5" />
            <Bar className="mt-1.5 h-3 w-3/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** The Export pill, before we know whether this household may use it. */
export function ExportFallback() {
  return (
    <span
      aria-hidden
      className="btn-quiet pointer-events-none animate-pulse opacity-55"
    >
      Export everything
    </span>
  );
}

/** The drawers, on the same two-column grid the hub itself uses. */
export function HouseFileFallback() {
  return (
    <Card padding="none">
      <div className="px-4 pb-3 pt-4">
        <h2 className="text-base font-semibold text-ink">The house file</h2>
      </div>

      <div className="grid animate-pulse grid-cols-2">
        {CATEGORIES.map((category, i) => {
          const full = CATEGORIES.length % 2 === 1 && i === CATEGORIES.length - 1;
          return (
            <div
              key={category}
              className={`flex items-center gap-3 border-t border-rule px-3.5 py-3 ${
                full ? "col-span-2" : i % 2 === 0 ? "border-r border-rule" : ""
              }`}
            >
              <span className="h-9 w-9 shrink-0 rounded-lg bg-paper-sunk" />
              <div className="min-w-0 flex-1">
                <Bar className="h-3.5 w-24" />
                <Bar className="mt-1.5 h-3 w-16" />
              </div>
            </div>
          );
        })}
      </div>

      <p className="border-t border-rule px-4 py-3 text-xs text-ink-faint">
        Open a drawer to see what is filed there, or + to put something in it.
      </p>
    </Card>
  );
}

export function GlanceFallback() {
  return (
    <Card tone="accent">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pill bg-paper-raised text-sage"
        >
          <Sparkles size={18} strokeWidth={1.9} />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-ink">
            Your home at a glance
          </h2>
          <p className="mt-1.5 text-sm text-ink-soft">Reading through the file…</p>
        </div>
      </div>
    </Card>
  );
}

/** The morning's suggestions. Gone entirely if there is nothing to suggest. */
export function HintsFallback() {
  return (
    <Card title="Helpful hints">
      <div className="flex animate-pulse flex-col gap-2">
        {[0, 1].map((row) => (
          <div
            key={row}
            className="flex items-center gap-3 rounded-lg bg-sage-wash px-3 py-2.5"
          >
            <span className="h-9 w-9 shrink-0 rounded-pill bg-sage-tint" />
            <div className="min-w-0 flex-1">
              <Bar className="h-3.5 w-2/5" />
              <Bar className="mt-1.5 h-3 w-4/5" />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function ComingUpFallback() {
  return (
    <Card title="Coming up">
      <Rows count={3} />
    </Card>
  );
}

/** The shopping's one line. Gone entirely if there is nothing to get. */
export function ShoppingFallback() {
  return (
    <Card padding="none">
      <div className="flex animate-pulse items-center gap-3 px-4 py-3.5">
        <span className="h-9 w-9 shrink-0 rounded-pill bg-paper-sunk" />
        <div className="min-w-0 flex-1">
          <Bar className="h-3.5 w-28" />
          <Bar className="mt-1.5 h-3 w-2/5" />
        </div>
      </div>
    </Card>
  );
}

/** The filed documents, the numbers and the contacts, all still coming. */
export function FilingFallback() {
  return (
    <Card>
      <Bar className="h-4 w-28 animate-pulse" />
      <div className="mt-4">
        <Rows count={3} />
      </div>
    </Card>
  );
}
