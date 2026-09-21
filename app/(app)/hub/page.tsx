import type { ReactNode } from "react";
import Link from "next/link";
import {
  Backpack,
  CalendarDays,
  FileText,
  MapPin,
  Repeat,
  UtensilsCrossed,
} from "lucide-react";
import { requireOnboarded } from "@/lib/household";
import { loadHubData } from "@/lib/hub-data";
import { appTitle } from "@/lib/brand";

export const metadata = {
  title: appTitle("Hub"),
  description: "Kitchen display — today, who's where, and what's coming up.",
};

export default async function HubPage() {
  const { household } = await requireOnboarded();
  const data = await loadHubData(household.id);

  return (
    <div className="mx-auto grid max-w-[1400px] gap-5 lg:grid-cols-3 lg:gap-6">
      <HubColumn title="Today" icon={CalendarDays} href="/calendar">
        {data.loadFault ? <HubFault message={data.loadFault} /> : null}
        {data.today.length === 0 && !data.loadFault ? (
          <HubEmpty message="Nothing flagged for today yet." />
        ) : (
          <ul className="divide-y divide-dashed divide-rule">
            {data.today.map((row) => (
              <HubTodayRow key={row.key} row={row} />
            ))}
          </ul>
        )}
      </HubColumn>

      <div className="flex flex-col gap-5 lg:gap-6">
        <HubColumn
          title="Who's where"
          icon={MapPin}
          href="/dashboard"
          compact
        >
          {data.whosWhere.length === 0 ? (
            <HubEmpty message="Add people on Family to see who's where." />
          ) : (
            <ul className="divide-y divide-rule">
              {data.whosWhere.map((row) => (
                <li
                  key={row.personId}
                  className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <span className="text-xl font-medium text-ink">{row.name}</span>
                  <span className="truncate text-xl text-sage">{row.status}</span>
                </li>
              ))}
            </ul>
          )}
        </HubColumn>

        <HubColumn title="Meals" icon={UtensilsCrossed} href="/family" compact>
          <ul className="divide-y divide-rule">
            {data.meals.map((row) => (
              <li
                key={row.key}
                className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <span className="flex items-center gap-2 text-xl font-medium text-ink">
                  <CalendarDays
                    size={18}
                    strokeWidth={1.8}
                    className="shrink-0 text-sage"
                    aria-hidden
                  />
                  {row.label}
                </span>
                <span className="truncate text-xl text-sage">{row.title}</span>
              </li>
            ))}
          </ul>
        </HubColumn>
      </div>

      <HubColumn title="Coming up" icon={CalendarDays} href="/calendar">
        {data.comingUp.length === 0 ? (
          <HubEmpty message="Nothing on the horizon." />
        ) : (
          <ul className="divide-y divide-dashed divide-rule">
            {data.comingUp.map((row) => (
              <HubComingUpRow key={row.key} row={row} />
            ))}
          </ul>
        )}
      </HubColumn>
    </div>
  );
}

function HubColumn({
  title,
  icon: Icon,
  href,
  children,
  compact = false,
}: {
  title: string;
  icon: typeof CalendarDays;
  href: string;
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <section className={`card flex flex-col ${compact ? "p-4 sm:p-5" : "p-5 sm:p-6"}`}>
      <Link
        href={href}
        className="mb-4 flex items-center gap-2 text-sage transition-opacity hover:opacity-80"
      >
        <Icon size={22} strokeWidth={1.8} aria-hidden />
        <h2 className="text-2xl font-semibold text-ink">{title}</h2>
      </Link>
      <div className="flex-1">{children}</div>
    </section>
  );
}

function HubTodayRow({
  row,
}: {
  row: { key: string; title: string; note: string; href: string };
}) {
  const isKit = /kit|ingredients|pe/i.test(row.title);
  const Icon = isKit ? Backpack : row.title === "Dinner" ? UtensilsCrossed : Repeat;

  return (
    <li>
      <Link
        href={row.href}
        className="flex items-center gap-4 py-4 transition-opacity hover:opacity-80"
      >
        <span
          aria-hidden
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-navy-tint text-ink"
        >
          <Icon size={22} strokeWidth={1.8} />
        </span>
        <span className="min-w-0">
          <span className="block text-xl font-semibold text-ink">{row.title}</span>
          <span className="block truncate text-xl text-sage">{row.note}</span>
        </span>
      </Link>
    </li>
  );
}

function HubComingUpRow({
  row,
}: {
  row: { key: string; title: string; note: string; href: string };
}) {
  const isDoc = row.href === "/documents";
  const Icon = isDoc ? FileText : CalendarDays;

  return (
    <li>
      <Link
        href={row.href}
        className="flex items-center gap-4 py-4 transition-opacity hover:opacity-80"
      >
        <span
          aria-hidden
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-navy-tint text-ink"
        >
          <Icon size={22} strokeWidth={1.8} />
        </span>
        <span className="min-w-0">
          <span className="block text-xl font-semibold text-ink">{row.title}</span>
          <span className="block truncate text-xl text-sage">{row.note}</span>
        </span>
      </Link>
    </li>
  );
}

function HubEmpty({ message }: { message: string }) {
  return <p className="text-lg text-ink-faint">{message}</p>;
}

function HubFault({ message }: { message: string }) {
  return (
    <p role="status" className="mb-3 text-lg text-oxblood">
      {message}
    </p>
  );
}
