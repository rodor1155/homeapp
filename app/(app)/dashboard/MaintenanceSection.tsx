import Link from "next/link";
import { Wrench } from "lucide-react";
import { Card } from "@/components/ui";
import { formatDate, relativeWhen } from "@/lib/dates";
import type { Locale } from "@/lib/household";
import {
  upcomingDates,
} from "@/lib/home-overview";
import { loadOverviewDocuments } from "./overview-data";

const HORIZON = 90;
const LIMIT = 5;

/**
 * Thin aggregation of upcoming renewals / MOT / boiler-style dates from
 * already-filed documents — not a new product surface.
 */
export default async function MaintenanceSection({
  householdId,
  locale,
}: {
  householdId: string;
  locale: Locale;
}) {
  const documents = await loadOverviewDocuments(householdId);
  const dates = upcomingDates(documents)
    .filter((d) => d.daysAway >= 0 && d.daysAway <= HORIZON)
    .slice(0, LIMIT);

  if (dates.length === 0) return null;

  return (
    <Card
      title="Maintenance clock"
      action={
        <Link href="/documents" className="text-action text-xs">
          Documents
        </Link>
      }
    >
      <ul className="flex flex-col gap-1">
        {dates.map((entry, i) => (
          <li
            key={`${entry.date}-${entry.label}-${i}`}
            className="flex items-center justify-between gap-3 rounded-lg px-2.5 py-2"
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <span
                aria-hidden
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pill bg-navy-tint text-ink"
              >
                <Wrench size={17} strokeWidth={1.9} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-ink">
                  {entry.provider}
                </span>
                <span className="block truncate text-xs text-ink-faint">
                  {entry.label}
                </span>
              </span>
            </span>
            <span className="tnum shrink-0 text-right">
              <span className="block text-sm text-ink">
                {formatDate(entry.date, locale)}
              </span>
              <span className="block text-xs text-ink-faint">
                {relativeWhen(entry.daysAway)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
