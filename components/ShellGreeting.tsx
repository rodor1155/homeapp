import Link from "next/link";
import { Settings } from "lucide-react";

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
 * Greeting row — sticky cream bar on other tabs, frosted overlay on the Home
 * map hero.
 */
export default function ShellGreeting({
  user,
  variant = "header",
}: {
  user: ShellUser;
  variant?: "header" | "overlay";
}) {
  const name = displayName(user);
  const firstName = name.split(/\s+/)[0] ?? name;

  const settingsLink = (
    <Link
      href="/settings"
      aria-label="Settings"
      className={
        variant === "overlay"
          ? "home-hero-glass flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-soft transition-colors hover:text-ink"
          : "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-sage-tint hover:text-ink"
      }
    >
      <Settings size={19} strokeWidth={1.8} aria-hidden />
    </Link>
  );

  const avatar = (
    <span
      aria-hidden
      className={
        variant === "overlay"
          ? "home-hero-glass flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-sage"
          : "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sage-tint text-sm font-semibold text-sage"
      }
    >
      {initials(name)}
    </span>
  );

  if (variant === "overlay") {
    return (
      <div className="home-hero-overlay relative z-20 flex items-center gap-2.5 px-5 pb-2 pt-[calc(env(safe-area-inset-top)+0.375rem)]">
        <p className="home-hero-greeting-text min-w-0 flex-1 truncate text-lg font-semibold text-ink">
          Hello, {firstName}
        </p>
        {settingsLink}
        {avatar}
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[32rem] items-center gap-3 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-lg font-semibold text-ink">
          Hello, {firstName}
        </p>
        <p className="truncate text-xs text-ink-faint">{user.email}</p>
      </div>
      {settingsLink}
      {avatar}
    </div>
  );
}
