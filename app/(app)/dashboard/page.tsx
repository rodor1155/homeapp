import type { Metadata } from "next";
import { requireOnboarded, type Locale } from "@/lib/household";
import EveningMapHome from "./EveningMapHome";
import { appTitle } from "@/lib/brand";

export const metadata: Metadata = {
  title: appTitle("Home"),
};

export default async function DashboardPage() {
  const { user, household, property } = await requireOnboarded();
  const locale: Locale = household.locale ?? "UK";

  return (
    <EveningMapHome
      user={user}
      locale={locale}
      householdId={household.id}
      address={property.address}
    />
  );
}
