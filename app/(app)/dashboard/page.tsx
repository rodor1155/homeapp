import Link from "next/link";
import { FileText, Users } from "lucide-react";
import { Suspense } from "react";
import { requireOnboarded, type Locale } from "@/lib/household";
import ComingUpSection from "./ComingUpSection";
import HeroExport from "./HeroExport";
import HouseFileSection from "./HouseFileSection";
import AppMark from "@/components/AppMark";
import { resolveHomeMap } from "@/lib/home-map";
import InvitesBanner from "./InvitesBanner";
import {
  ComingUpFallback,
  ExportFallback,
  HouseFileFallback,
} from "./Skeletons";
import { appTitle } from "@/lib/brand";

export const metadata = { title: appTitle("Home overview") };

/**
 * Hartley-tight Home: map hero, a short Coming up briefing, one or two
 * navy/sage CTAs, and a house-file peek. Longer surfaces live on their own
 * tabs (Family, Lists, Documents, Calendar) — not stacked under the map.
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

      <section className="home-hero card relative left-1/2 w-[100dvw] max-w-none -translate-x-1/2 overflow-hidden rounded-none border-x-0 px-5 pb-5 pt-6 sm:left-auto sm:w-auto sm:max-w-none sm:translate-x-0 sm:rounded-[var(--radius-card)] sm:border-x sm:pt-5">
        <Suspense fallback={null}>
          <HomeMapUnderlay address={property.address} />
        </Suspense>
        <div aria-hidden className="home-hero-scrim" />
        <div className="relative z-10 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-sage">
              Your home
            </p>
            <h1 className="mt-1 text-2xl drop-shadow-[0_1px_0_rgb(247_243_235_/_0.65)]">
              {household.name}
            </h1>
            <p className="mt-1 whitespace-pre-line text-sm font-medium text-ink-soft">
              {property.address}
            </p>
            {detail ? (
              <p className="mt-0.5 text-sm text-ink-faint">{detail}</p>
            ) : null}
          </div>
          <AppMark size="lg" />
        </div>
        <div className="relative z-10 mt-6 flex flex-wrap gap-2">
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

      <Suspense fallback={<ComingUpFallback />}>
        <ComingUpSection
          householdId={household.id}
          locale={locale}
          limit={4}
        />
      </Suspense>

      <HomeCtaRow />

      <Suspense fallback={<HouseFileFallback />}>
        <HouseFileSection
          householdId={household.id}
          locale={locale}
          peek
        />
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
    <p className="relative z-10 mt-4 text-[10px] font-medium text-ink-faint">
      Map © OpenStreetMap
    </p>
  );
}

/** Navy / sage CTAs — ink hierarchy on paper, not a pastel promo rainbow. */
function HomeCtaRow() {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Link href="/documents?upload=1#upload" className="card-promo card-promo-navy">
        <span className="card-promo-kicker">House file</span>
        <span className="flex items-start justify-between gap-2">
          <span className="min-w-0">
            <span className="block text-sm font-semibold leading-snug text-ink">
              File a document
            </span>
            <span className="mt-1 block text-xs leading-relaxed text-ink-soft">
              Policies, bills and letters in one place
            </span>
          </span>
          <span
            aria-hidden
            className="icon-well shrink-0 bg-navy-tint text-ink ring-1 ring-navy/15"
          >
            <FileText size={17} strokeWidth={1.9} />
          </span>
        </span>
      </Link>
      <Link href="/family" className="card-promo card-promo-sage">
        <span className="card-promo-kicker">Household</span>
        <span className="flex items-start justify-between gap-2">
          <span className="min-w-0">
            <span className="block text-sm font-semibold leading-snug text-ink">
              Keep family close
            </span>
            <span className="mt-1 block text-xs leading-relaxed text-ink-soft">
              People, schools and who&rsquo;s where today
            </span>
          </span>
          <span
            aria-hidden
            className="icon-well shrink-0 bg-sage-tint text-sage ring-1 ring-sage-soft/30"
          >
            <Users size={17} strokeWidth={1.9} />
          </span>
        </span>
      </Link>
    </div>
  );
}
