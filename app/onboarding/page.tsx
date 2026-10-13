import { redirect } from "next/navigation";
import { getEntitlements } from "@/lib/billing";
import { isOnboarded, loadHouseholdContext } from "@/lib/household";
import { loadPendingInvites } from "@/lib/invites";
import OnboardingWizard from "./OnboardingWizard";
import { appTitle } from "@/lib/brand";

export const metadata = { title: appTitle("Get started") };

export default async function OnboardingPage() {
  const ctx = await loadHouseholdContext();
  if (!ctx.user) redirect("/sign-in");
  if (isOnboarded(ctx)) redirect("/dashboard");

  const invites = await loadPendingInvites(ctx.supabase);
  if (invites.length > 0) redirect("/invite");

  // No household yet means nothing to share yet either; the action checks
  // the plan again when the invite is noted.
  const canInvite = ctx.household
    ? (await getEntitlements(ctx.household.id, { userEmail: ctx.user.email }))
        .canInvite
    : true;

  return (
    <OnboardingWizard
      canInvite={canInvite}
      defaultLocale={ctx.household?.locale ?? null}
      defaultAddress={ctx.property?.address ?? ""}
      defaultType={ctx.property?.type ?? ""}
      defaultYearBuilt={ctx.property?.year_built ?? null}
    />
  );
}
