import type { ReactNode } from "react";
import BottomTabBar from "@/components/BottomTabBar";
import CreateFab from "@/components/CreateFab";
import PrefetchAppRoutes from "@/components/PrefetchAppRoutes";
import PullToRefresh from "@/components/PullToRefresh";
import ShellGreeting, {
  displayName,
  type ShellUser,
} from "@/components/ShellGreeting";

export type { ShellUser };
export { displayName };

/**
 * The signed-in chrome: page ground, a sticky greeting bar and the bottom
 * tab bar. Content is a centred mobile-width column so it stays readable on
 * a desktop window.
 *
 * On Home (`hideHeader`), the greeting moves onto the map hero — no cream
 * strip above the underlay.
 */
export default function AppShell({
  user,
  hideHeader = false,
  isHome = false,
  children,
}: {
  user: ShellUser;
  /** Home owns the greeting as a map overlay — suppress the sticky bar. */
  hideHeader?: boolean;
  /** Full-bleed evening map — no paper column or side padding. */
  isHome?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`min-h-dvh ${isHome ? "bg-night" : "bg-paper"}`}>
      <PrefetchAppRoutes />
      {!hideHeader ? (
        <header className="shell-header sticky top-0 z-20 border-b border-rule-strong bg-paper/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
          <ShellGreeting user={user} />
        </header>
      ) : null}

      <main
        className={`mx-auto w-full ${
          isHome ? "max-w-none px-0 pt-0" : "max-w-[32rem] px-4 pt-5"
        }`}
        style={{
          paddingBottom: isHome
            ? 0
            : "calc(var(--mobile-tab-bar-height) + max(12px, var(--safe-area-bottom)) + 5rem)",
        }}
      >
        <PullToRefresh>{children}</PullToRefresh>
      </main>

      <CreateFab />
      <BottomTabBar />
    </div>
  );
}
