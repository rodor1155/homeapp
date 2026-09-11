import ExportButton from "@/components/ExportButton";
import { getEntitlements, isBillingConfigured } from "@/lib/billing";

export default async function HeroExport({
  householdId,
}: {
  householdId: string;
}) {
  const billingConfigured = isBillingConfigured();
  const entitlements = await getEntitlements(householdId);
  return (
    <ExportButton
      canExport={entitlements.canExport}
      billingConfigured={billingConfigured}
      variant="quiet"
      align="start"
    >
      Export everything
    </ExportButton>
  );
}
