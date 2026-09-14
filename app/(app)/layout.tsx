import type { ReactNode } from "react";
import ShellRouter from "@/components/ShellRouter";
import { requireOnboarded } from "@/lib/household";

/**
 * The signed-in chrome, owned once for every tab rather than re-wrapped by
 * each page. Switching tabs swaps only what is below this, so the greeting bar
 * and the tab bar stay put — and `loading.tsx` next to this file fills the gap
 * while the new page is read.
 *
 * `/hub` swaps in `HubShell` instead — no tab bar, landscape kitchen display.
 *
 * The pages inside still call `requireOnboarded()` for the household they
 * need; `loadHouseholdContext` is memoised per request, so that is free.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const { user, household } = await requireOnboarded();

  return (
    <ShellRouter user={user} householdName={household.name}>
      {children}
    </ShellRouter>
  );
}
