import { redirect } from "next/navigation";
import { isOnboarded, loadHouseholdContext } from "@/lib/household";
import OnboardingWizard from "./OnboardingWizard";

export const metadata = { title: "Get started · homeapp" };

export default async function OnboardingPage() {
  const ctx = await loadHouseholdContext();
  if (!ctx.user) redirect("/sign-in");
  if (isOnboarded(ctx)) redirect("/dashboard");

  return (
    <OnboardingWizard
      defaultLocale={ctx.household?.locale ?? null}
      defaultAddress={ctx.property?.address ?? ""}
      defaultType={ctx.property?.type ?? ""}
      defaultYearBuilt={ctx.property?.year_built ?? null}
    />
  );
}
