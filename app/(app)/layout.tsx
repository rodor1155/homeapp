import type { ReactNode } from "react";
import NativeStoreSync from "@/components/NativeStoreSync";
import PlanProvider from "@/components/PlanProvider";
import ShellRouter from "@/components/ShellRouter";
import { getEntitlements } from "@/lib/billing";
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
 *
 * The household's plan is read here once so that anything below can open the
 * paywall instead of a form the server would refuse, and so the iPhone app's
 * own screens (renewals, the vault) are told which plan to apply.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const { user, household } = await requireOnboarded();
  const entitlements = await getEntitlements(household.id, {
    userEmail: user.email,
  });

  return (
    <PlanProvider
      summary={{
        plan: entitlements.plan,
        canInvite: entitlements.canInvite,
        canAddFamilyDates: entitlements.canAddFamilyDates,
        renewalLimit: entitlements.renewalLimit,
        householdId: household.id,
      }}
    >
      <ShellRouter user={user} householdName={household.name}>
        <NativeStoreSync />
        {children}
      </ShellRouter>
    </PlanProvider>
  );
}
