import Link from "next/link";
import { KeyRound, Plus } from "lucide-react";
import {
  CATEGORY_ICON,
  CATEGORY_SHORT_LABEL,
  CATEGORY_TONE,
} from "@/components/category-icons";
import { Card } from "@/components/ui";
import { CATEGORIES, type Category } from "@/lib/categories";
import { TONE_PILL } from "@/lib/tones";

/* The house file: one drawer per filing category. Home uses `peek` — a short
   briefing of the busiest drawers + a clear path into Documents. */

const PEEK_DRAWERS = 4;

function documentsHref(category: Category, upload = false): string {
  const params = new URLSearchParams();
  if (upload) params.set("upload", "1");
  params.set("category", category);
  return `/documents?${params.toString()}${upload ? "#upload" : ""}`;
}

function filedLabel(n: number): string {
  if (n === 0) return "Nothing here yet";
  return `${n} ${n === 1 ? "document" : "documents"}`;
}

function drawersForVariant(
  counts: Record<Category, number>,
  variant: "full" | "peek"
): Category[] {
  if (variant === "full") return [...CATEGORIES];
  // Prefer drawers that already have filings; fill with the rest so the
  // peek still shows the shape of the file when everything is empty.
  const ranked = [...CATEGORIES].sort((a, b) => counts[b] - counts[a]);
  return ranked.slice(0, PEEK_DRAWERS);
}

export default function PropertyHub({
  counts,
  variant = "full",
}: {
  counts: Record<Category, number>;
  variant?: "full" | "peek";
}) {
  const total = CATEGORIES.reduce((sum, c) => sum + counts[c], 0);
  const drawers = drawersForVariant(counts, variant);
  const peek = variant === "peek";

  return (
    <Card padding="none">
      <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden
            className="icon-well bg-sage-tint text-sage ring-1 ring-sage-soft/25"
          >
            <KeyRound size={17} strokeWidth={1.9} />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink">The house file</h2>
            <p className="text-xs text-ink-faint">
              {peek
                ? "A quick look — open Documents for every drawer"
                : "Every drawer of the home, ready to browse"}
            </p>
          </div>
        </div>
        <span className="tnum shrink-0 rounded-pill bg-navy-wash px-2.5 py-1 text-xs font-semibold text-ink-soft">
          {total === 0 ? "Ready" : `${total} filed`}
        </span>
      </div>

      {total === 0 ? (
        <div className="border-t border-rule px-4 py-4">
          <div className="empty-state rounded-[calc(var(--radius-card)-4px)] bg-sage-wash/70">
            <span
              aria-hidden
              className="icon-well-lg icon-well bg-sage-tint text-sage ring-1 ring-sage-soft/30"
            >
              <KeyRound size={22} strokeWidth={1.9} />
            </span>
            <p className="mt-1 text-base font-semibold text-ink">No documents stored</p>
            <p className="empty-state-body">
              Start with a policy or bill — each drawer lights up as you file.
            </p>
            <Link
              href="/documents?upload=1#upload"
              className="btn mt-3 w-full max-w-xs"
            >
              Store a document
            </Link>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-2 border-t border-rule">
        {drawers.map((category, i) => {
          const Icon = CATEGORY_ICON[category];
          const n = counts[category];
          const tone = CATEGORY_TONE[category];
          const last = i === drawers.length - 1;
          const full =
            drawers.length % 2 === 1 && last;
          const edges = `${
            !full && i % 2 === 0 ? "border-r border-rule" : ""
          } ${i >= 2 ? "border-t border-rule" : ""}`;

          return (
            <div
              key={category}
              className={`relative ${full ? "col-span-2" : ""} ${edges}`}
            >
              <Link
                href={documentsHref(category)}
                aria-label={`${category} — ${filedLabel(n).toLowerCase()}`}
                className="tap-row group flex items-center gap-3 px-3.5 py-3.5 pr-11"
              >
                <span
                  aria-hidden
                  className={`icon-well transition-colors ${
                    n > 0
                      ? TONE_PILL[tone]
                      : "bg-paper-sunk text-ink-faint ring-1 ring-dashed ring-rule-strong group-hover:text-ink-soft"
                  }`}
                >
                  <Icon size={18} strokeWidth={1.9} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-ink">
                    {CATEGORY_SHORT_LABEL[category]}
                  </span>
                  <span
                    className={`tnum block text-xs ${
                      n > 0 ? "font-medium text-ink-soft" : "text-ink-faint"
                    }`}
                  >
                    {filedLabel(n)}
                  </span>
                </span>
              </Link>

              <Link
                href={documentsHref(category, true)}
                aria-label={`Add a document to ${category}`}
                title={`Add a document to ${category}`}
                className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-pill bg-navy-wash text-ink transition-colors hover:bg-ink hover:text-paper-raised"
              >
                <Plus size={16} strokeWidth={2.2} aria-hidden />
              </Link>
            </div>
          );
        })}
      </div>

      <p className="border-t border-rule px-4 py-3 text-xs text-ink-soft">
        {peek ? (
          <>
            <Link href="/documents" className="text-action">
              Open Documents
            </Link>
            {" — "}browse every drawer, or + to file something new.
          </>
        ) : (
          <>
            Tap a drawer to browse what&rsquo;s filed, or + to add your first
            document there.
          </>
        )}
      </p>
    </Card>
  );
}
