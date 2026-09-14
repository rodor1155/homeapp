import type { ReactNode } from "react";
import Link from "next/link";
import { Circle } from "lucide-react";
import HubClock from "@/components/HubClock";
import HubRefresh from "@/components/HubRefresh";
import { Wordmark } from "@/components/ui";

/**
 * Full-viewport chrome for the kitchen iPad hub — no greeting bar, no tab bar,
 * landscape-first three-column layout inside the page.
 */
export default function HubShell({
  householdName,
  children,
}: {
  householdName: string;
  children: ReactNode;
}) {
  return (
    <div className="hub-shell flex min-h-screen flex-col bg-paper">
      <HubRefresh />
      <header className="border-b border-rule px-6 py-5 sm:px-8">
        <div className="mx-auto flex max-w-[1400px] items-start justify-between gap-6">
          <div className="min-w-0">
            <Wordmark className="text-sm text-sage" />
            <h1 className="mt-1 truncate font-display text-3xl text-ink sm:text-4xl">
              {householdName}
            </h1>
          </div>
          <HubClock />
        </div>
      </header>

      <main className="flex-1 px-6 py-5 sm:px-8">{children}</main>

      <footer className="border-t border-rule px-6 py-4 sm:px-8">
        <Link
          href="/dashboard"
          className="mx-auto flex max-w-[1400px] items-center justify-center gap-2 text-base text-ink-soft transition-colors hover:text-ink"
        >
          <Circle size={14} strokeWidth={1.5} className="text-sage" aria-hidden />
          <span>Hub mode · tap to open full app</span>
        </Link>
      </footer>
    </div>
  );
}
