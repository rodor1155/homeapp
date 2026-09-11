import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui";
import {
  loadHouseholdEvents,
  loadHouseholdPeople,
  loadSchoolCalendarEvents,
  loadSchools,
} from "@/lib/family";
import { requireOnboarded, type Locale } from "@/lib/household";
import EventsPanel from "./EventsPanel";
import PeoplePanel from "./PeoplePanel";
import SchoolsPanel from "./SchoolsPanel";

export const metadata = { title: "Family · homeapp" };

export default async function FamilyPage() {
  const { supabase, user, household } = await requireOnboarded();
  const locale: Locale = household.locale ?? "UK";

  const [people, schools, events, calendarEvents] = await Promise.all([
    loadHouseholdPeople(supabase, household.id),
    loadSchools(supabase, household.id),
    loadHouseholdEvents(supabase, household.id),
    loadSchoolCalendarEvents(supabase, household.id),
  ]);

  const children = people.filter((person) => person.kind === "child");

  return (
    <AppShell user={user}>
      <div className="flex flex-col gap-4">
        <div className="px-1">
          <h1 className="text-2xl">Family</h1>
          <p className="mt-0.5 text-sm text-ink-soft">
            Who lives at {household.name}, where the children go, and the dates
            worth remembering.
          </p>
        </div>

        <Card
          title="Who lives here"
          action={
            <span className="tnum text-xs text-ink-faint">
              {people.length} {people.length === 1 ? "person" : "people"}
            </span>
          }
        >
          <PeoplePanel people={people} schools={schools} locale={locale} />
        </Card>

        <Card
          title="Schools"
          action={
            children.length > 0 ? (
              <span className="tnum text-xs text-ink-faint">
                {children.length} {children.length === 1 ? "child" : "children"}
              </span>
            ) : undefined
          }
        >
          <SchoolsPanel
            schools={schools}
            people={people}
            calendarEvents={calendarEvents}
            locale={locale}
          />
        </Card>

        <Card title="Key dates">
          <EventsPanel events={events} people={people} locale={locale} />
        </Card>

        <p className="px-1 pt-2 text-center text-xs text-ink-faint">
          Birthdays come from the people above, so you only ever type one in
          once, and a school&rsquo;s term dates come from its own calendar.
          Everything here is shared with everyone in the household.
        </p>
      </div>
    </AppShell>
  );
}
