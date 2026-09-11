import type { ReactNode } from "react";
import Link from "next/link";
import { Settings } from "lucide-react";
import BottomTabBar from "@/components/BottomTabBar";
import PullToRefresh from "@/components/PullToRefresh";
import SignOutButton from "@/components/SignOutButton";
import { Wordmark } from "@/components/ui";

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
    <div className="min-h-screen bg-paper">
      <header className="sticky top-0 z-20 border-b border-rule bg-paper/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[32rem] items-center gap-3 px-4 py-2.5">
          <div className="min-w-0 flex-1">
            <Wordmark className="text-xs" />
            <p className="truncate text-base font-semibold text-ink">
              Hello, {firstName}
            </p>
          </div>
          <SignOutButton />
          <Link
            href="/settings"
            aria-label="Settings"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-navy-tint hover:text-ink"
          >
            <Settings size={19} strokeWidth={1.8} aria-hidden />
          </Link>
          <span
            aria-hidden
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-navy text-sm font-semibold text-paper-raised"
          >
            {initials(name)}
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[32rem] px-4 pb-28 pt-5">
        <PullToRefresh>{children}</PullToRefresh>
      </main>

      <BottomTabBar />
    </div>
  );
}
