import AppShell from "@/components/AppShell";
import SignOutButton from "@/components/SignOutButton";
import { Card } from "@/components/ui";
import { requireOnboarded } from "@/lib/household";
import { loadSentInvites } from "@/lib/invites";
import { loadHouseholdMembers } from "@/lib/members";
import DeleteAccountPanel from "./DeleteAccountPanel";
import HouseholdForm from "./HouseholdForm";
import PeoplePanel from "./PeoplePanel";

export const metadata = { title: "Settings · homeapp" };

export default async function SettingsPage() {
  const { supabase, user, household, property } = await requireOnboarded();

  const members = await loadHouseholdMembers(supabase, household.id);
  const invites = await loadSentInvites(supabase, household.id);

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
