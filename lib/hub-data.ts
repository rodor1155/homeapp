import "server-only";

import {
  documentEntries,
  mergeComingUp,
  routineEntries,
  schoolEntries,
  timetableEntries,
  type ComingUpEntry,
} from "@/lib/coming-up";
import {
  firstFault,
  loadHouseholdPeople,
  loadSchoolCalendarEvents,
  loadSchools,
  type HouseholdPerson,
} from "@/lib/family";
import { upcomingDates } from "@/lib/home-overview";
import { loadMealPlans, weekStartMonday, type MealPlan } from "@/lib/meals";
import { loadHouseholdRoutines } from "@/lib/routines";
import { loadPersonTimetableSlots, weekdayForDate } from "@/lib/timetable";
import { loadPersonDayStatuses, todayIso } from "@/lib/whos-where";
import { createClient } from "@/lib/supabase-server";
import { loadOverviewDocuments } from "@/app/(app)/dashboard/overview-data";

export type HubTodayRow = {
  key: string;
  title: string;
  note: string;
  href: string;
};

export type HubWhosWhereRow = {
  personId: string;
  name: string;
  status: string;
};

export type HubMealRow = {
  key: string;
  label: string;
  title: string;
};

export type HubComingUpRow = {
  key: string;
  title: string;
  note: string;
  href: string;
};

export type HubData = {
  today: HubTodayRow[];
  whosWhere: HubWhosWhereRow[];
  meals: HubMealRow[];
  comingUp: HubComingUpRow[];
  loadFault: string | null;
};

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function mealForWeekday(
  meals: readonly MealPlan[],
  weekday: number | null
): MealPlan | undefined {
  if (weekday == null) return undefined;
  return meals.find((m) => m.weekday === weekday);
}

function todayRows(
  timetable: ComingUpEntry[],
  routines: ComingUpEntry[],
  dinner: MealPlan | undefined
): HubTodayRow[] {
  const rows: HubTodayRow[] = [];

  for (const entry of timetable.filter((e) => e.daysAway === 0)) {
    rows.push({
      key: entry.key,
      title: entry.title.replace(/\s+today$/i, ""),
      note: entry.note,
      href: "/family",
    });
  }

  for (const entry of routines.filter((e) => e.daysAway === 0)) {
    rows.push({
      key: entry.key,
      title: entry.title,
      note: entry.note,
      href: "/family",
    });
  }

  if (dinner?.title.trim()) {
    rows.push({
      key: `dinner-${dinner.id}`,
      title: "Dinner",
      note: dinner.title.trim(),
      href: "/family",
    });
  }

  return rows;
}

function comingUpRows(entries: ComingUpEntry[]): HubComingUpRow[] {
  return entries.slice(0, 8).map((entry) => ({
    key: entry.key,
    title: entry.title,
    note: entry.note,
    href: entry.kind === "document" ? "/documents" : "/calendar",
  }));
}

function whosWhereRows(
  people: readonly HouseholdPerson[],
  statuses: Map<string, string>
): HubWhosWhereRow[] {
  return people.map((person) => ({
    personId: person.id,
    name: person.name,
    status: statuses.get(person.id)?.trim() || "—",
  }));
}

function mealRows(
  todayMeal: MealPlan | undefined,
  tomorrowMeal: MealPlan | undefined
): HubMealRow[] {
  return [
    {
      key: "meal-today",
      label: "Today",
      title: todayMeal?.title.trim() || "—",
    },
    {
      key: "meal-tomorrow",
      label: "Tomorrow",
      title: tomorrowMeal?.title.trim() || "—",
    },
  ];
}

/** One load for the kitchen hub — reuses the same family/overview sources as Home. */
export async function loadHubData(householdId: string): Promise<HubData> {
  const supabase = await createClient();
  const date = todayIso();
  const tomorrow = addDaysIso(date, 1);
  const weekStart = weekStartMonday();
  const todayWeekday = weekdayForDate(date);
  const tomorrowWeekday = weekdayForDate(tomorrow);

  const [
    documents,
    peopleLoad,
    schoolsLoad,
    schoolDatesLoad,
    timetableLoad,
    routinesLoad,
    mealsLoad,
    statusLoad,
  ] = await Promise.all([
    loadOverviewDocuments(householdId),
    loadHouseholdPeople(supabase, householdId),
    loadSchools(supabase, householdId),
    loadSchoolCalendarEvents(supabase, householdId),
    loadPersonTimetableSlots(supabase, householdId),
    loadHouseholdRoutines(supabase, householdId),
    loadMealPlans(supabase, householdId, weekStart),
    loadPersonDayStatuses(supabase, householdId, date),
  ]);

  const people = peopleLoad.items;
  const schools = schoolsLoad.items;
  const schoolDates = schoolDatesLoad.items;
  const timetableSlots = timetableLoad.items;
  const routines = routinesLoad.items;
  const meals = mealsLoad.items;

  const loadFault = firstFault(
    peopleLoad,
    schoolsLoad,
    schoolDatesLoad,
    timetableLoad,
    routinesLoad,
    mealsLoad,
    statusLoad
  );

  const timetable = timetableEntries(timetableSlots, people);
  const routineList = routineEntries(routines);
  const dinner = mealForWeekday(meals, todayWeekday);
  const todayMeal = dinner;
  const tomorrowMeal = mealForWeekday(meals, tomorrowWeekday);

  const schoolList = schoolEntries(schoolDates, schools, people).filter(
    (e) => e.daysAway > 0
  );
  const docList = documentEntries(upcomingDates(documents)).filter(
    (e) => e.daysAway > 0
  );
  const comingUp = mergeComingUp(schoolList, docList);

  const byPerson = new Map(
    statusLoad.items.map((s) => [s.person_id, s.status_text])
  );

  return {
    today: todayRows(timetable, routineList, dinner),
    whosWhere: whosWhereRows(people, byPerson),
    meals: mealRows(todayMeal, tomorrowMeal),
    comingUp: comingUpRows(comingUp),
    loadFault,
  };
}
