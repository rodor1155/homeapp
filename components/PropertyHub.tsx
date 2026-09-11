import Link from "next/link";
import { Plus } from "lucide-react";
import { CATEGORY_ICON, CATEGORY_SHORT_LABEL } from "@/components/category-icons";
import { Card } from "@/components/ui";
import { CATEGORIES, type Category } from "@/lib/categories";

/* The house file: one drawer per filing category, laid out on a ruled grid
   like the front of a plan chest. A drawer opens its slice of the file; its +
   opens the uploader already set to that category. Every drawer is shown,
   empty or not, so the shape of the file never changes under you. */

function documentsHref(category: Category, upload = false): string {
  const params = new URLSearchParams();
  if (upload) params.set("upload", "1");
  params.set("category", category);
  return `/documents?${params.toString()}${upload ? "#upload" : ""}`;
}

function filedLabel(n: number): string {
  if (n === 0) return "Empty";
  return `${n} ${n === 1 ? "document" : "documents"}`;
}

export default function PropertyHub({
  counts,
}: {
  counts: Record<Category, number>;
}) {
  const total = CATEGORIES.reduce((sum, c) => sum + counts[c], 0);

  return (
    <Card padding="none">
      <div className="flex items-baseline justify-between gap-3 px-4 pb-3 pt-4">
        <h2 className="text-base font-semibold text-ink">The house file</h2>
        <span className="tnum shrink-0 text-xs text-ink-faint">
          {total === 0 ? "nothing filed yet" : `${total} filed`}
        </span>
      </div>

      <div className="grid grid-cols-2">
        {CATEGORIES.map((category, i) => {
          const Icon = CATEGORY_ICON[category];
          const n = counts[category];

          // Seven drawers into two columns: the odd one out takes the full
          // width of the bottom row rather than leaving a gap.
          const full = CATEGORIES.length % 2 === 1 && i === CATEGORIES.length - 1;
          const edges = `border-t border-rule ${
            !full && i % 2 === 0 ? "border-r border-rule" : ""
          }`;

          return (
            <div
              key={category}
              className={`relative ${full ? "col-span-2" : ""} ${edges}`}
            >
              <Link
                href={documentsHref(category)}
                aria-label={`${category} — ${filedLabel(n).toLowerCase()}`}
                className="group flex items-center gap-3 px-3.5 py-3 pr-11"
              >
                <span
                  aria-hidden
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors ${
                    n > 0
                      ? "bg-sage-tint text-sage"
                      : "bg-paper-sunk text-ink-faint group-hover:text-ink-soft"
                  }`}
                >
                  <Icon size={18} strokeWidth={1.9} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink">
                    {CATEGORY_SHORT_LABEL[category]}
                  </span>
                  <span
                    className={`tnum block text-xs ${
                      n > 0 ? "text-ink-soft" : "text-ink-faint"
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
                className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-pill text-ink-faint transition-colors hover:bg-navy-tint hover:text-ink"
              >
                <Plus size={16} strokeWidth={2.2} aria-hidden />
              </Link>
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
