import type { ReactNode } from "react";
import Link from "next/link";
import { Settings } from "lucide-react";
import BottomTabBar from "@/components/BottomTabBar";
import CreateFab from "@/components/CreateFab";
import PrefetchAppRoutes from "@/components/PrefetchAppRoutes";
import PullToRefresh from "@/components/PullToRefresh";

/** Just enough of a Supabase user for the greeting — keeps this reusable. */
export type ShellUser = {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

function metadataName(meta: Record<string, unknown>): string | null {
  for (const key of ["full_name", "name", "preferred_username"]) {
    const value = meta[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

export function displayName(user: ShellUser): string {
  const fromMetadata = metadataName(user.user_metadata ?? {});
  if (fromMetadata) return fromMetadata;

  const local = (user.email ?? "").split("@")[0] ?? "";
  const cleaned = local.replace(/[._-]+/g, " ").trim();
  if (!cleaned) return "there";
  return cleaned.replace(/\b\w/g, (char) => char.toUpperCase());
}

function initials(name: string): string {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("");
  return letters.toUpperCase() || "?";
}

/**
 * The signed-in chrome: page ground, a sticky greeting bar and the bottom
 * tab bar. Content is a centred mobile-width column so it stays readable on
 * a desktop window.
 */
export default function AppShell({
  user,
  children,
}: {
  user: ShellUser;
  children: ReactNode;
}) {
  const name = displayName(user);
  const firstName = name.split(/\s+/)[0] ?? name;

  return (
    <div className="min-h-dvh bg-paper">
      <PrefetchAppRoutes />
      <header className="sticky top-0 z-20 border-b border-rule-strong bg-paper/90 pt-[env(safe-area-inset-top)] shadow-[0_1px_0_rgb(31_42_68_/_0.03)] backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[32rem] items-center gap-3 px-4 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-semibold text-ink">
              Hello, {firstName}
            </p>
            <p className="truncate text-xs text-ink-faint">{user.email}</p>
          </div>
          <Link
            href="/settings"
            aria-label="Settings"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-sage-tint hover:text-ink"
          >
            <Settings size={19} strokeWidth={1.8} aria-hidden />
          </Link>
          <span
            aria-hidden
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sage-tint text-sm font-semibold text-sage"
          >
            {initials(name)}
          </span>
        </div>
      </header>

      <main
        className="mx-auto w-full max-w-[32rem] px-4 pt-5"
        style={{
          paddingBottom:
            "calc(var(--mobile-tab-bar-height) + var(--safe-area-bottom) + 5rem)",
        }}
      >
        <PullToRefresh>{children}</PullToRefresh>
      </main>

      <CreateFab />
      <BottomTabBar />
    </div>
  );
}
