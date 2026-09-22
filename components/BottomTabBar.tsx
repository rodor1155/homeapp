"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import {
  CalendarDays,
  FileText,
  House,
  ShoppingBasket,
  Users,
  type LucideIcon,
} from "lucide-react";
import { APP_TAB_HREFS } from "@/lib/app-routes";
import { useViewMode } from "@/components/ViewModeToggle";

type Tab = {
  href: (typeof APP_TAB_HREFS)[number];
  label: string;
  icon: LucideIcon;
};

const TAB_META: Record<
  (typeof APP_TAB_HREFS)[number],
  { label: string; icon: LucideIcon }
> = {
  "/dashboard": { label: "Home", icon: House },
  "/family": { label: "Family", icon: Users },
  "/calendar": { label: "Calendar", icon: CalendarDays },
  "/lists": { label: "Lists", icon: ShoppingBasket },
  "/documents": { label: "Documents", icon: FileText },
};

const TABS: Tab[] = APP_TAB_HREFS.map((href) => ({
  href,
  ...TAB_META[href],
}));

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function BottomTabBar() {
  const pathname = usePathname();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const viewMode = useViewMode();
  const tabs =
    viewMode === "child"
      ? TABS.filter((tab) => tab.href !== "/documents")
      : TABS;

  const routeHref =
    tabs.find((tab) => isActive(pathname, tab.href))?.href ?? pathname;
  // Optimistic highlight until the real route catches up — no effect needed.
  const highlightHref =
    pendingHref && pendingHref !== routeHref ? pendingHref : routeHref;

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-rule-strong bg-paper-raised/97 shadow-bar backdrop-blur-md"
      style={{ paddingBottom: "max(0.55rem, env(safe-area-inset-bottom, 0px))" }}
    >
      <ul className="mx-auto flex w-full max-w-[32rem] items-stretch px-1 pt-1.5">
        {tabs.map((tab) => {
          const active = isActive(highlightHref, tab.href);
          const Icon = tab.icon;
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                // Full prefetch so the Client Cache uses the longer static TTL
                // and a second tap can paint from memory instead of the network.
                prefetch={true}
                aria-current={active ? "page" : undefined}
                onClick={() => {
                  if (isActive(pathname, tab.href)) return;
                  startTransition(() => setPendingHref(tab.href));
                }}
                className={`flex min-h-[3.5rem] flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-[11px] font-semibold transition-colors active:scale-[0.97] ${
                  active ? "text-ink" : "text-ink-faint hover:text-ink-soft"
                }`}
              >
                <span
                  className={`flex h-9 w-[4.5rem] items-center justify-center rounded-pill transition-colors ${
                    active
                      ? "bg-sage-tint text-sage shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-sage-soft)_28%,transparent)]"
                      : "text-ink-faint"
                  }`}
                >
                  <Icon size={22} strokeWidth={active ? 2.35 : 1.7} aria-hidden />
                </span>
                <span className="relative">
                  {tab.label}
                  {active ? (
                    <span
                      aria-hidden
                      className="absolute -bottom-1.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-pill bg-ink"
                    />
                  ) : null}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
