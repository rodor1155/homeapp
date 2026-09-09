import { redirect } from "next/navigation";
import { isOnboarded, loadHouseholdContext } from "@/lib/household";
import { loadPendingInvites } from "@/lib/invites";

export default async function Home() {
  const ctx = await loadHouseholdContext();
  if (!ctx.user) redirect("/sign-in");
  if (isOnboarded(ctx)) redirect("/dashboard");

  // No home of their own yet: if someone has invited them into theirs, that is
  // the thing to do first — onboarding would only build a second household.
  const invites = await loadPendingInvites(ctx.supabase);
  redirect(invites.length > 0 ? "/invite" : "/onboarding");
}
