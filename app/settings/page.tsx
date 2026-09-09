import AppShell from "@/components/AppShell";
import SignOutButton from "@/components/SignOutButton";
import { Card } from "@/components/ui";
import {
  getEntitlements,
  isBillingConfigured,
  loadSubscription,
} from "@/lib/billing";
import { requireOnboarded } from "@/lib/household";
import { loadSentInvites } from "@/lib/invites";
import { loadHouseholdMembers } from "@/lib/members";
import DeleteAccountPanel from "./DeleteAccountPanel";
import HouseholdForm from "./HouseholdForm";
import PeoplePanel from "./PeoplePanel";
import PlanPanel from "./PlanPanel";

export const metadata = { title: "Settings · homeapp" };

export default async function SettingsPage(props: PageProps<"/settings">) {
  const { billing } = await props.searchParams;
  const { supabase, user, household, property } = await requireOnboarded();

  const members = await loadHouseholdMembers(supabase, household.id);
  const invites = await loadSentInvites(supabase, household.id);

  const billingConfigured = isBillingConfigured();
  const entitlements = await getEntitlements(household.id);
  // The row is only read for the renewal date on the paid card. A free
  // household has no date to show, and with billing unconfigured there is no
  // row at all — so neither case touches the table.
  const subscription =
    billingConfigured && entitlements.activeSubscription
      ? await loadSubscription(household.id)
      : null;

  // The member list is the household's own rows, so this is the whole truth
  // for the household the user is looking at.
  const soleMember = members.length <= 1;

  return (
    <AppShell user={user}>
      <div className="flex flex-col gap-4">
        <div className="px-1">
          <h1 className="text-2xl">Settings</h1>
          <p className="mt-0.5 truncate text-sm text-ink-soft">
            Signed in as {user.email}
          </p>
        </div>

        <Card title="Your household">
          <HouseholdForm
            defaultName={household.name}
            defaultLocale={household.locale}
            defaultAddress={property.address}
            defaultType={property.type ?? ""}
            defaultYearBuilt={property.year_built}
          />
        </Card>

        <Card title="Plan">
          <PlanPanel
            configured={billingConfigured}
            plan={entitlements.plan}
            locale={household.locale}
            periodEnd={subscription?.current_period_end ?? null}
            cancelAtPeriodEnd={subscription?.cancel_at_period_end ?? false}
            justPaid={billing === "success"}
          />
        </Card>

        <Card
          title="People"
          action={
            <span className="tnum text-xs text-ink-faint">
              {members.length} {members.length === 1 ? "person" : "people"}
            </span>
          }
        >
          <PeoplePanel
            members={members}
            invites={invites}
            currentUserId={user.id}
          />
        </Card>

        <Card title="Sign out">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-ink-soft">
              You will need your email address to get back in.
            </p>
            <div className="shrink-0">
              <SignOutButton />
            </div>
          </div>
        </Card>

        <Card title="Delete account" className="border-oxblood/40">
          <DeleteAccountPanel
            householdName={household.name}
            soleMember={soleMember}
          />
        </Card>
      </div>
    </AppShell>
  );
}
