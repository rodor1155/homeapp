import Link from "next/link";
import { House, Plus } from "lucide-react";
import { CATEGORY_ICON, CATEGORY_SHORT_LABEL } from "@/components/category-icons";
import { Card } from "@/components/ui";
import { CATEGORIES, type Category } from "@/lib/categories";

/* The property hub: the property in the middle, one bucket per filing
   category around it. A bucket opens its slice of the file; its + opens the
   uploader already set to that category. Every bucket is shown, empty or not,
   so the shape of the file is always the same. */

/** How far out the buckets sit, as a share of the (square) hub. */
const RADIUS = 35;
/** Where a spoke starts, clear of the centre disc. */
const SPOKE_START = 17;

function position(index: number, radius: number) {
  const angle = (-90 + (360 / CATEGORIES.length) * index) * (Math.PI / 180);
  return { x: 50 + radius * Math.cos(angle), y: 50 + radius * Math.sin(angle) };
}

function documentsHref(category: Category, upload = false): string {
  const params = new URLSearchParams();
  if (upload) params.set("upload", "1");
  params.set("category", category);
  return `/documents?${params.toString()}${upload ? "#upload" : ""}`;
}

export default function PropertyHub({
  counts,
}: {
  counts: Record<Category, number>;
}) {
  const total = CATEGORIES.reduce((sum, c) => sum + counts[c], 0);

  return (
    <Card>
      <div className="relative mx-auto aspect-square w-full max-w-[23rem]">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden
          className="absolute inset-0 h-full w-full"
        >
          {CATEGORIES.map((category, i) => {
            const from = position(i, SPOKE_START);
            const to = position(i, RADIUS);
            return (
              <line
                key={category}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                vectorEffect="non-scaling-stroke"
                className="stroke-rule-strong"
                strokeWidth="1"
              />
            );
          })}
        </svg>

        <div
          className="absolute left-1/2 top-1/2 flex h-[6.25rem] w-[6.25rem] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-0.5 rounded-full border border-sage-soft/50 bg-sage-tint text-sage"
        >
          <House size={26} strokeWidth={1.7} aria-hidden />
          <span className="text-xs font-semibold text-ink">Property</span>
          <span className="tnum text-[0.625rem] text-ink-faint">
            {total} {total === 1 ? "document" : "documents"}
          </span>
        </div>

        {CATEGORIES.map((category, i) => {
          const Icon = CATEGORY_ICON[category];
          const n = counts[category];
          const { x, y } = position(i, RADIUS);

          return (
            <div
              key={category}
              className="absolute flex w-[5.25rem] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5"
              style={{ left: `${x}%`, top: `${y}%` }}
            >
              <Link
                href={documentsHref(category)}
                aria-label={`${category} — ${n} ${
                  n === 1 ? "document" : "documents"
                }`}
                className="group flex flex-col items-center gap-1.5"
              >
                <span className="relative flex h-14 w-14 items-center justify-center rounded-full border border-dashed border-rule-strong bg-paper-raised text-ink-soft transition-colors group-hover:border-sage-soft group-hover:text-sage">
                  <Icon size={22} strokeWidth={1.8} aria-hidden />
                  {n > 0 ? (
                    <span className="tnum absolute -bottom-1 -left-1 flex h-5 min-w-5 items-center justify-center rounded-pill bg-sage-tint px-1 text-[0.625rem] font-semibold text-sage">
                      {n}
                    </span>
                  ) : null}
                </span>
                <span className="text-center text-[0.6875rem] font-medium leading-tight text-ink">
                  {CATEGORY_SHORT_LABEL[category]}
                </span>
              </Link>

              <Link
                href={documentsHref(category, true)}
                aria-label={`Add a document to ${category}`}
                title={`Add a document to ${category}`}
                className="absolute left-1/2 top-0 -mt-1 ml-3.5 flex h-6 w-6 items-center justify-center rounded-full bg-navy text-paper-raised transition-colors hover:bg-navy-soft"
              >
                <Plus size={14} strokeWidth={2.4} aria-hidden />
              </Link>
            </div>
          );
        })}
      </div>

      <p className="mt-1 text-center text-xs text-ink-faint">
        Tap a bucket to see what’s filed there, or + to add something to it.
      </p>
    </Card>
  );
}
