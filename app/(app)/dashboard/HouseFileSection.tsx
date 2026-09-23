import { Suspense } from "react";
import { Sparkles } from "lucide-react";
import PropertyHub from "@/components/PropertyHub";
import { Card } from "@/components/ui";
import { countByCategory, type OverviewDocument } from "@/lib/home-overview";
import { summariseHome } from "@/lib/home-summary";
import type { Locale } from "@/lib/household";
import { loadOverviewDocuments } from "./overview-data";
import { GlanceFallback } from "./Skeletons";

/* The house file, and optionally the written line above it. On Home we only
   peek the drawers; the full file and glance live when `peek` is false. */

export default async function HouseFileSection({
  householdId,
  locale,
  peek = false,
}: {
  householdId: string;
  locale: Locale;
  /** Compact Home briefing — drawers peek + link into Documents. */
  peek?: boolean;
}) {
  const documents = await loadOverviewDocuments(householdId);

  return (
    <>
      <PropertyHub counts={countByCategory(documents)} variant={peek ? "peek" : "full"} />

      {!peek && documents.length > 0 ? (
        <Suspense fallback={<GlanceFallback />}>
          <AtAGlance documents={documents} locale={locale} />
        </Suspense>
      ) : null}
    </>
  );
}

/* --- the AI summary: best-effort, omitted entirely if it doesn't come back --- */

async function AtAGlance({
  documents,
  locale,
}: {
  documents: readonly OverviewDocument[];
  locale: Locale;
}) {
  const summary = await summariseHome({ documents, locale });
  if (!summary) return null;

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
          <p className="mt-1.5 text-sm text-ink">{summary}</p>
        </div>
      </div>
    </Card>
  );
}
