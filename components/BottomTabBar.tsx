"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FileText,
  House,
  ShoppingBasket,
  Users,
  type LucideIcon,
} from "lucide-react";

type Tab = {
  href: string;
  label: string;
  icon: LucideIcon;
};

/* Add a tab by adding a row here — the bar sizes itself. */
const TABS: Tab[] = [
  { href: "/dashboard", label: "Home", icon: House },
  { href: "/family", label: "Family", icon: Users },
  { href: "/lists", label: "Lists", icon: ShoppingBasket },
  { href: "/documents", label: "Documents", icon: FileText },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function BottomTabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-paper-raised/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto flex w-full max-w-[32rem] items-stretch px-2">
        {TABS.map((tab) => {
          const active = isActive(pathname, tab.href);
          const Icon = tab.icon;
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
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
