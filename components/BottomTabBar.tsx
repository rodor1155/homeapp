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

  const routeHref =
    TABS.find((tab) => isActive(pathname, tab.href))?.href ?? pathname;
  // Optimistic highlight until the real route catches up — no effect needed.
  const highlightHref =
    pendingHref && pendingHref !== routeHref ? pendingHref : routeHref;

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-paper-raised/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto flex w-full max-w-[32rem] items-stretch px-2">
        {TABS.map((tab) => {
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
                className={`flex flex-col items-center gap-1 py-2 text-xs font-medium transition-colors ${
                  active ? "text-ink" : "text-ink-faint hover:text-ink-soft"
                }`}
              >
                <span
                  className={`flex h-8 w-16 items-center justify-center rounded-pill transition-colors ${
                    active ? "bg-sage-tint text-sage" : ""
                  }`}
                >
                  <Icon size={20} strokeWidth={active ? 2.2 : 1.7} aria-hidden />
                </span>
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
