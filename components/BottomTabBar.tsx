"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
import {
  hasNativeVault,
  openNativeVault,
  useHasNativeVault,
} from "@/lib/native-vault";

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
  "/documents": { label: "Vault", icon: FileText },
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
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const viewMode = useViewMode();
  const nativeVault = useHasNativeVault();
  const tabs =
    viewMode === "child"
      ? TABS.filter((tab) => tab.href !== "/documents")
      : TABS;

  const routeHref =
    tabs.find((tab) => isActive(pathname, tab.href))?.href ?? pathname;
  const highlightHref =
    pendingHref && pendingHref !== routeHref ? pendingHref : routeHref;

  return (
    <nav aria-label="Main" className="tab-bar-pill">
      <ul className="flex w-full items-stretch px-1.5 py-1">
        {tabs.map((tab) => {
          const active = isActive(highlightHref, tab.href);
          const Icon = tab.icon;
          return (
            <li key={tab.href} className="flex flex-1">
              <Link
                href={tab.href}
                prefetch={true}
                aria-current={active ? "page" : undefined}
                onClick={(event) => {
                  if (
                    tab.href === "/documents" &&
                    (nativeVault || hasNativeVault())
                  ) {
                    event.preventDefault();
                    void openNativeVault().then((opened) => {
                      if (!opened) {
                        startTransition(() => setPendingHref(tab.href));
                        router.push(tab.href);
                      }
                    });
                    return;
                  }
                  if (isActive(pathname, tab.href)) return;
                  startTransition(() => setPendingHref(tab.href));
                }}
                className={`tab-bar-pill-link ${
                  active ? "tab-bar-pill-link--active" : ""
                }`}
              >
                <span className="tab-bar-pill-icon-wrap">
                  <Icon
                    size={22}
                    strokeWidth={active ? 2.35 : 1.7}
                    aria-hidden
                  />
                </span>
                <span>{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
