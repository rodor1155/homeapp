"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  type ReactNode,
} from "react";
import type { Plan } from "@/lib/billing";
import {
  hasNativeStore,
  openNativePaywall,
  syncNativePlan,
  type PaywallReason,
} from "@/lib/native-store";

/* What the household's plan allows, for the client components that have to
   decide between doing something and showing the paywall. The server decides
   the plan (getEntitlements) and every gated action checks it again; this is
   only so a tap opens the paywall instead of a form that would be refused. */

export type PlanSummary = {
  plan: Plan;
  canInvite: boolean;
  canAddFamilyDates: boolean;
  /** Renewals the iPhone app will track; null is unlimited. */
  renewalLimit: number | null;
  householdId: string;
};

const PlanContext = createContext<PlanSummary | null>(null);

export default function PlanProvider({
  summary,
  children,
}: {
  summary: PlanSummary;
  children: ReactNode;
}) {
  // `summary` is a new object each time the server renders the layout, so the
  // app is told again after every refresh — including one that follows a
  // purchase the server turned down.
  useEffect(() => {
    void syncNativePlan({
      plan: summary.plan,
      renewalLimit: summary.renewalLimit,
      householdId: summary.householdId,
    });
  }, [summary]);

  return <PlanContext.Provider value={summary}>{children}</PlanContext.Provider>;
}

/** Everything is allowed outside the signed-in app (no provider above). */
export function usePlan(): PlanSummary | null {
  return useContext(PlanContext);
}

/**
 * Opens the paywall: Apple's in the iPhone app, the Plan card in Settings on
 * the web. Resolves once the app's paywall has closed.
 */
export function usePaywall(): (reason: PaywallReason) => Promise<void> {
  const router = useRouter();
  const summary = useContext(PlanContext);
  const householdId = summary?.householdId ?? null;

  return useCallback(
    async (reason: PaywallReason) => {
      if (householdId && hasNativeStore()) {
        const result = await openNativePaywall(householdId, reason);
        if (result.changed) router.refresh();
        return;
      }
      router.push("/settings");
    },
    [householdId, router]
  );
}
