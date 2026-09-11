import Link from "next/link";
import { Suspense } from "react";
import { requireOnboarded, type Locale } from "@/lib/household";
import ComingUpSection from "./ComingUpSection";
import FilingSection from "./FilingSection";
import HelpfulHintsSection from "./HelpfulHintsSection";
import HeroExport from "./HeroExport";
import HouseFileSection from "./HouseFileSection";
import HouseIllustration from "./HouseIllustration";
import InvitesBanner from "./InvitesBanner";
import ShoppingSection from "./ShoppingSection";
import {
  ComingUpFallback,
  ExportFallback,
  FilingFallback,
  HintsFallback,
  HouseFileFallback,
  ShoppingFallback,
} from "./Skeletons";

export const metadata = { title: "Home overview · homeapp" };

/**
 * Home paints the hero as soon as the household is known. Everything below —
 * hints, house file, Coming up, shopping, filed lists — streams in behind its
 * own Suspense boundary. Documents are loaded once per request via
 * `loadOverviewDocuments` (React `cache`), so those sections share a round trip
 * without blocking each other or the hero.
 */
export default async function DashboardPage() {
  const { user, household, property } = await requireOnboarded();
  const locale: Locale = household.locale ?? "UK";

  const detail = [
    property.type,
    property.year_built ? `built ${property.year_built}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="flex flex-col gap-4">
      <Suspense fallback={null}>
        <InvitesBanner />
      </Suspense>

      <section className="home-hero card overflow-hidden p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-sage">
              Your home
            </p>
            <h1 className="mt-1 text-2xl">{household.name}</h1>
            <p className="mt-1 whitespace-pre-line text-sm text-ink-soft">
              {property.address}
            </p>
            {detail ? (
              <p className="mt-0.5 text-sm text-ink-faint">{detail}</p>
            ) : null}
          </div>
          <HouseIllustration className="h-16 w-24" />
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/documents" className="btn">
            Open the documents file
          </Link>
          <Suspense fallback={<ExportFallback />}>
            <HeroExport householdId={household.id} />
          </Suspense>
        </div>
      </section>

      <Suspense fallback={<HintsFallback />}>
        <HelpfulHintsSection householdId={household.id} locale={locale} />
      </Suspense>

      <Suspense fallback={<HouseFileFallback />}>
        <HouseFileSection householdId={household.id} locale={locale} />
      </Suspense>

      <Suspense fallback={<ComingUpFallback />}>
        <ComingUpSection householdId={household.id} locale={locale} />
      </Suspense>

      <Suspense fallback={<ShoppingFallback />}>
        <ShoppingSection householdId={household.id} />
      </Suspense>

      <Suspense fallback={<FilingFallback />}>
        <FilingSection householdId={household.id} locale={locale} />
      </Suspense>

      <p className="px-1 pt-2 text-center text-xs text-ink-faint">
        Signed in as {user.email}. Renewal reminders come by email.
      </p>
    </div>
  );
}
