import Link from "next/link";
import { CalendarDays, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui";
import {
  firstFault,
  loadHouseholdEvents,
  loadHouseholdPeople,
  loadSchoolCalendarEvents,
  loadSchools,
} from "@/lib/family";
import { requireOnboarded, type Locale } from "@/lib/household";
import { loadPersonTimetableSlots } from "@/lib/timetable";
import EventsPanel from "./EventsPanel";
import PeoplePanel from "./PeoplePanel";
import SchoolsPanel from "./SchoolsPanel";
import TimetablePanel from "./TimetablePanel";

export const metadata = { title: "Family · homeapp" };

export default async function FamilyPage() {
  const { supabase, household } = await requireOnboarded();
  const locale: Locale = household.locale ?? "UK";

  const [peopleLoad, schoolsLoad, eventsLoad, calendarLoad, timetableLoad] =
    await Promise.all([
      loadHouseholdPeople(supabase, household.id),
      loadSchools(supabase, household.id),
      loadHouseholdEvents(supabase, household.id),
      loadSchoolCalendarEvents(supabase, household.id),
      loadPersonTimetableSlots(supabase, household.id),
    ]);

  const people = peopleLoad.items;
  const schools = schoolsLoad.items;
  const events = eventsLoad.items;
  const calendarEvents = calendarLoad.items;
  const timetableSlots = timetableLoad.items;
  const loadFault = firstFault(
    peopleLoad,
    schoolsLoad,
    eventsLoad,
    calendarLoad,
    timetableLoad
  );

  const children = people.filter((person) => person.kind === "child");

  return (
    <div className="flex flex-col gap-4">
      <div className="px-1">
        <h1 className="text-2xl">Family</h1>
        <p className="mt-0.5 text-sm text-ink-soft">
          Who lives at {household.name}, where the children go, and the dates
          worth remembering.
        </p>
      </div>

      {loadFault ? (
        <p
          role="status"
          className="rounded border border-oxblood/30 bg-oxblood-tint px-3 py-2 text-sm text-oxblood"
        >
          {loadFault}
        </p>
      ) : null}

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
        title="School timetable"
        action={
          children.length > 0 ? (
            <span className="tnum text-xs text-ink-faint">
              {timetableSlots.length}{" "}
              {timetableSlots.length === 1 ? "lesson" : "lessons"}
            </span>
          ) : undefined
        }
      >
        <TimetablePanel
          people={people}
          slots={timetableSlots}
          fault={timetableLoad.fault}
        />
      </Card>

      <Card title="Key dates">
        <EventsPanel events={events} people={people} locale={locale} />
      </Card>

      <Card padding="none">
        <Link href="/calendar" className="flex items-center gap-3 px-4 py-3.5">
          <span
            aria-hidden
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pill bg-sage-tint text-sage"
          >
            <CalendarDays size={17} strokeWidth={1.9} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-ink">
              Open the family calendar
            </span>
            <span className="block truncate text-xs text-ink-faint">
              Birthdays, key dates and term dates, a month at a time
            </span>
          </span>
          <ChevronRight
            size={16}
            strokeWidth={1.9}
            aria-hidden
            className="shrink-0 text-ink-faint"
          />
        </Link>
      </Card>

      <p className="px-1 pt-2 text-center text-xs text-ink-faint">
        Birthdays come from the people above, so you only ever type one in once,
        and a school&rsquo;s term dates come from its own calendar. Everything
        here is shared with everyone in the household.
      </p>
    </div>
  );
}
