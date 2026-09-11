import Link from "next/link";
import { Inbox } from "lucide-react";
import { Card } from "@/components/ui";
import { Suspense } from "react";
import { requireOnboarded, type Locale } from "@/lib/household";
import ComingUpSection from "./ComingUpSection";
import FilingSection from "./FilingSection";
import HelpfulHintsSection from "./HelpfulHintsSection";
import HeroExport from "./HeroExport";
import HouseFileSection from "./HouseFileSection";
import HouseIllustration from "./HouseIllustration";
import { resolveHomeMap } from "@/lib/home-map";
import InvitesBanner from "./InvitesBanner";
import MaintenanceSection from "./MaintenanceSection";
import ShoppingSection from "./ShoppingSection";
import WhosWhereSection from "./WhosWhereSection";
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
 *
 * The map underlay is decorative: resolve it in a child Suspense so postcodes.io
 * cannot hold the first byte of the hero chrome.
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

      <section className="home-hero card relative overflow-hidden p-5">
        <Suspense fallback={null}>
          <HomeMapUnderlay address={property.address} />
        </Suspense>
        <div className="relative z-10 flex items-start justify-between gap-3">
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
        <div className="relative z-10 mt-5 flex flex-wrap gap-2">
          <Link href="/documents" className="btn">
            Open the documents file
          </Link>
          <Suspense fallback={<ExportFallback />}>
            <HeroExport householdId={household.id} />
          </Suspense>
        </div>
        <Suspense fallback={null}>
          <HomeMapCredit address={property.address} />
        </Suspense>
      </section>

      <Suspense fallback={<HintsFallback />}>
        <HelpfulHintsSection householdId={household.id} locale={locale} />
      </Suspense>

      <Suspense fallback={<HouseFileFallback />}>
        <HouseFileSection householdId={household.id} locale={locale} />
      </Suspense>

      <Suspense fallback={null}>
        <WhosWhereSection householdId={household.id} />
      </Suspense>

      <Suspense fallback={<ComingUpFallback />}>
        <ComingUpSection householdId={household.id} locale={locale} />
      </Suspense>

      <Suspense fallback={null}>
        <MaintenanceSection householdId={household.id} locale={locale} />
      </Suspense>

      <Suspense fallback={<ShoppingFallback />}>
        <ShoppingSection householdId={household.id} />
      </Suspense>

      <CardLinkInbox />

      <Suspense fallback={<FilingFallback />}>
        <FilingSection householdId={household.id} locale={locale} />
      </Suspense>

      <p className="px-1 pt-2 text-center text-xs text-ink-faint">
        Signed in as {user.email}. Renewal reminders come by email.
      </p>
    </div>
  );
}

/** Decorative map wash — streams in after geocode; must not block hero chrome. */
async function HomeMapUnderlay({ address }: { address: string }) {
  const homeMap = await resolveHomeMap(address);
  if (!homeMap) return null;
  return (
    <div
      aria-hidden
      className="home-hero-map"
      style={{ backgroundImage: `url(${homeMap.imagePath})` }}
    />
  );
}

async function HomeMapCredit({ address }: { address: string }) {
  const homeMap = await resolveHomeMap(address);
  if (!homeMap) return null;
  return (
    <p className="relative z-10 mt-3 text-[10px] text-ink-faint">
      Map © OpenStreetMap · Carto
    </p>
  );
}


function CardLinkInbox() {
  return (
    <Card padding="none">
      <Link
        href="/documents?category=Home%20inbox&upload=1#upload"
        className="flex items-center gap-3 px-4 py-3.5"
      >
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pill bg-ochre-tint text-ochre"
        >
          <Inbox size={17} strokeWidth={1.9} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-ink">Home inbox</span>
          <span className="block truncate text-xs text-ink-faint">
            Drop a school letter or slip — dated ones show in Coming up
          </span>
        </span>
      </Link>
    </Card>
  );
}
