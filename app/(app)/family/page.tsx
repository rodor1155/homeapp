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
import InviteSomeoneButton from "@/components/InviteSomeoneButton";
import { loadPendingInviteLinks } from "@/lib/invite-links";
import { requireOnboarded, type Locale } from "@/lib/household";
import { loadMealPlans, weekStartMonday } from "@/lib/meals";
import { loadRenewalItems } from "@/lib/renewals";
import type { DocumentRow } from "@/lib/document-types";
import { loadHouseholdRoutines } from "@/lib/routines";
import { loadPersonTimetableSlots } from "@/lib/timetable";
import EventsPanel from "./EventsPanel";
import PeoplePanel from "./PeoplePanel";
import RenewalsPanel from "./RenewalsPanel";
import SchoolsPanel from "./SchoolsPanel";
import MealsPanel from "./MealsPanel";
import RoutinesPanel from "./RoutinesPanel";
import TimetablePanel from "./TimetablePanel";
import WhosWhereSection from "../dashboard/WhosWhereSection";
import { Suspense } from "react";
import { appTitle } from "@/lib/brand";

export const metadata = { title: appTitle("Family") };

function first(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export default async function FamilyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { supabase, household } = await requireOnboarded();
  const params = await searchParams;
  const startAddingPerson = first(params.add) === "person";
  const openRenewalId = first(params.renewal);
  const locale: Locale = household.locale ?? "UK";

  const weekStart = weekStartMonday();
  const [
    peopleLoad,
    schoolsLoad,
    eventsLoad,
    calendarLoad,
    timetableLoad,
    routinesLoad,
    mealsLoad,
    renewalsLoad,
    documentsResult,
    inviteLinks,
    kidLinksResult,
  ] = await Promise.all([
    loadHouseholdPeople(supabase, household.id),
    loadSchools(supabase, household.id),
    loadHouseholdEvents(supabase, household.id),
    loadSchoolCalendarEvents(supabase, household.id),
    loadPersonTimetableSlots(supabase, household.id),
    loadHouseholdRoutines(supabase, household.id),
    loadMealPlans(supabase, household.id, weekStart),
    loadRenewalItems(supabase, household.id),
    supabase
      .from("documents")
      .select("id, original_filename, category")
      .eq("household_id", household.id)
      .order("created_at", { ascending: false }),
    loadPendingInviteLinks(supabase, household.id),
    supabase
      .from("person_kid_links")
      .select("person_id, token")
      .eq("household_id", household.id),
  ]);

  const people = peopleLoad.items;
  const schools = schoolsLoad.items;
  const events = eventsLoad.items;
  const calendarEvents = calendarLoad.items;
  const timetableSlots = timetableLoad.items;
  const routines = routinesLoad.items;
  const meals = mealsLoad.items;
  const renewals = renewalsLoad.items;
  const documents = ((documentsResult.data as DocumentRow[] | null) ?? []).map(
    (doc) => ({
      id: doc.id,
      original_filename: doc.original_filename,
      category: doc.category,
    })
  );

  const loadFault = firstFault(
    peopleLoad,
    schoolsLoad,
    eventsLoad,
    calendarLoad,
    timetableLoad,
    routinesLoad,
    mealsLoad,
    renewalsLoad
  );

  const children = people.filter((person) => person.kind === "child");

  const kidLinkTokens: Record<string, string | null> = {};
  if (!kidLinksResult.error) {
    for (const row of kidLinksResult.data ?? []) {
      kidLinkTokens[row.person_id as string] = row.token as string;
    }
  }

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

      <Suspense fallback={null}>
        <WhosWhereSection householdId={household.id} />
      </Suspense>

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
          <div className="flex items-center gap-2">
            <InviteSomeoneButton pendingLinks={inviteLinks} />
            <span className="tnum text-xs text-ink-faint">
              {people.length} {people.length === 1 ? "person" : "people"}
            </span>
          </div>
        }
      >
        <PeoplePanel
          people={people}
          schools={schools}
          locale={locale}
          startAdding={startAddingPerson}
          kidLinkTokens={kidLinkTokens}
        />
      </Card>

      <Card
        title="Renewals & deadlines"
        action={
          <span className="tnum text-xs text-ink-faint">
            {renewals.filter((item) => item.status === "active").length} tracked
          </span>
        }
      >
        <Suspense fallback={null}>
          <RenewalsPanel
            items={renewals}
            people={people}
            documents={documents}
            locale={locale}
            fault={renewalsLoad.fault}
            initialRenewalId={openRenewalId}
          />
        </Suspense>
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

      <Card
        title="Routines"
        action={
          <span className="tnum text-xs text-ink-faint">
            {routines.length}{" "}
            {routines.length === 1 ? "beat" : "beats"}
          </span>
        }
      >
        <RoutinesPanel routines={routines} fault={routinesLoad.fault} />
      </Card>

      <Card title="This week’s dinners">
        <MealsPanel
          meals={meals}
          weekStart={weekStart}
          fault={mealsLoad.fault}
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
