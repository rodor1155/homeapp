import { redirect } from "next/navigation";
import { isOnboarded, loadHouseholdContext } from "@/lib/household";

export default async function Home() {
  const ctx = await loadHouseholdContext();
  if (!ctx.user) redirect("/sign-in");
  redirect(isOnboarded(ctx) ? "/dashboard" : "/onboarding");
}
