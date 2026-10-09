#!/usr/bin/env node
/**
 * Creates (or refreshes) the App Review demo account and fills its household
 * with realistic sample data, so Apple's reviewer signs in to a lived-in app.
 *
 * Nothing is hard-coded: the account's email and password come from the
 * environment (or .env.local), and the script refuses to write anything until
 * you name the Supabase project it is pointed at.
 *
 *   REVIEW_DEMO_EMAIL=…  REVIEW_DEMO_PASSWORD=…  \
 *   NEXT_PUBLIC_SUPABASE_URL=…  SUPABASE_SERVICE_ROLE_KEY=…  \
 *   node scripts/seed-review-demo.mjs                      # dry run: shows the plan
 *   node scripts/seed-review-demo.mjs --confirm <project-ref>
 *   node scripts/seed-review-demo.mjs --confirm <project-ref> --reset
 *
 * --reset clears the demo household's sample data first and seeds it again
 * (use it after a reviewer has edited or deleted things). It only ever touches
 * the household that belongs to REVIEW_DEMO_EMAIL.
 *
 * The same REVIEW_DEMO_EMAIL must be set on Vercel: that is what lets this one
 * account past the paywall (lib/review-demo.ts). See docs/appstore/review-notes.md.
 */

import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

loadEnvLocal();

const args = process.argv.slice(2);
const confirmIndex = args.indexOf("--confirm");
const confirmRef = confirmIndex === -1 ? null : (args[confirmIndex + 1] ?? "");
const reset = args.includes("--reset");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const email = process.env.REVIEW_DEMO_EMAIL?.trim().toLowerCase();
const password = process.env.REVIEW_DEMO_PASSWORD ?? "";

const missing = [
  ["NEXT_PUBLIC_SUPABASE_URL", url],
  ["SUPABASE_SERVICE_ROLE_KEY", serviceKey],
  ["REVIEW_DEMO_EMAIL", email],
  ["REVIEW_DEMO_PASSWORD", password],
]
  .filter(([, value]) => !value)
  .map(([name]) => name);
if (missing.length > 0) {
  console.error(`Missing: ${missing.join(", ")}`);
  process.exit(1);
}
if (password.length < 12) {
  console.error("REVIEW_DEMO_PASSWORD must be at least 12 characters.");
  process.exit(1);
}

const projectRef = new URL(url).hostname.split(".")[0];

console.log(`Supabase project : ${projectRef} (${url})`);
console.log(`Demo account     : ${email}`);
console.log(`Mode             : ${reset ? "reset and reseed" : "create if missing"}`);

if (confirmRef !== projectRef) {
  console.log(
    `\nDry run — nothing was changed. To go ahead against this project, re-run with:\n  --confirm ${projectRef}`
  );
  process.exit(confirmRef === null ? 0 : 1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function must(result, what) {
  if (result.error) {
    throw new Error(`${what}: ${result.error.message}`);
  }
  return result.data;
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function daysFromNow(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return isoDate(date);
}

/** Monday of the current week, as the meal planner keys it. */
function mondayOfThisWeek() {
  const date = new Date();
  const weekday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - weekday);
  return isoDate(date);
}

/** Next time this month/day comes round, for birthdays in "Coming up". */
function birthdayIn(yearOfBirth, daysAhead) {
  const next = new Date();
  next.setUTCDate(next.getUTCDate() + daysAhead);
  return `${yearOfBirth}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(
    next.getUTCDate()
  ).padStart(2, "0")}`;
}

async function findUserByEmail(target) {
  for (let page = 1; page <= 50; page += 1) {
    const { users } = must(
      await admin.auth.admin.listUsers({ page, perPage: 200 }),
      "list users"
    );
    const match = users.find((user) => user.email?.toLowerCase() === target);
    if (match) return match;
    if (users.length < 200) return null;
  }
  return null;
}

async function ensureUser() {
  const existing = await findUserByEmail(email);
  if (existing) {
    must(
      await admin.auth.admin.updateUserById(existing.id, {
        password,
        email_confirm: true,
      }),
      "update demo user"
    );
    console.log("Demo user exists — password set from REVIEW_DEMO_PASSWORD.");
    return existing.id;
  }
  const { user } = must(
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: "Sam Ashworth" },
    }),
    "create demo user"
  );
  console.log("Demo user created.");
  return user.id;
}

async function ensureHousehold(userId) {
  // A household is created for every new user by the on_auth_user_created trigger.
  let membership = must(
    await admin
      .from("household_members")
      .select("household_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    "read membership"
  );
  if (!membership) {
    const household = must(
      await admin.from("households").insert({ name: "The Ashworths" }).select("id").single(),
      "create household"
    );
    must(
      await admin
        .from("household_members")
        .insert({ household_id: household.id, user_id: userId, role: "owner" }),
      "create membership"
    );
    membership = { household_id: household.id };
  }
  return membership.household_id;
}

async function clearSampleData(householdId) {
  // Children first; the rest cascade from these or are independent.
  for (const table of [
    "person_timetable_slots",
    "household_meal_plans",
    "household_routines",
    "shopping_list_items",
    "shopping_lists",
    "household_events",
    "household_people",
    "schools",
  ]) {
    must(
      await admin.from(table).delete().eq("household_id", householdId),
      `clear ${table}`
    );
  }
}

async function seed(householdId, userId) {
  must(
    await admin
      .from("households")
      .update({ name: "The Ashworths", locale: "UK" })
      .eq("id", householdId),
    "update household"
  );

  const property = must(
    await admin
      .from("properties")
      .select("id")
      .eq("household_id", householdId)
      .limit(1)
      .maybeSingle(),
    "read property"
  );
  const propertyValues = {
    address: "14 Orchard Lane, Harpenden, AL5 2JQ",
    type: "Semi-detached house",
    year_built: 1934,
  };
  if (property) {
    must(
      await admin.from("properties").update(propertyValues).eq("id", property.id),
      "update property"
    );
  } else {
    must(
      await admin
        .from("properties")
        .insert({ household_id: householdId, ...propertyValues }),
      "create property"
    );
  }

  const schools = must(
    await admin
      .from("schools")
      .insert([
        {
          household_id: householdId,
          name: "Orchard Fields Primary School",
          address: "Manland Way, Harpenden",
          postcode: "AL5 4QP",
          notes: "Gates open 8:40. PE kit on Tuesdays and Fridays.",
        },
        {
          household_id: householdId,
          name: "St Hilda's Secondary School",
          address: "Sun Lane, Harpenden",
          postcode: "AL5 4TD",
          notes: "Bus 357 from the High Street at 7:55.",
        },
      ])
      .select("id, name"),
    "create schools"
  );
  const primary = schools.find((school) => school.name.startsWith("Orchard"));
  const secondary = schools.find((school) => school.name.startsWith("St Hilda"));

  const people = must(
    await admin
      .from("household_people")
      .insert([
        {
          household_id: householdId,
          user_id: userId,
          name: "Sam",
          kind: "adult",
          birthday: birthdayIn(1986, 75),
          colour: "sage",
          sort_order: 0,
        },
        {
          household_id: householdId,
          name: "Priya",
          kind: "adult",
          relation: "partner",
          birthday: birthdayIn(1987, 19),
          colour: "sky",
          sort_order: 1,
        },
        {
          household_id: householdId,
          name: "Maya",
          kind: "child",
          relation: "daughter",
          birthday: birthdayIn(2013, 33),
          school_id: secondary.id,
          year_group: "Year 8",
          colour: "rose",
          sort_order: 2,
        },
        {
          household_id: householdId,
          name: "Leo",
          kind: "child",
          relation: "son",
          birthday: birthdayIn(2017, 6),
          school_id: primary.id,
          year_group: "Year 4",
          colour: "amber",
          notes: "Swimming on Thursdays — towel and goggles.",
          sort_order: 3,
        },
      ])
      .select("id, name"),
    "create people"
  );
  const maya = people.find((person) => person.name === "Maya");
  const leo = people.find((person) => person.name === "Leo");

  must(
    await admin.from("household_events").insert([
      {
        household_id: householdId,
        title: "Bin day — recycling and garden waste",
        event_date: daysFromNow(2),
        event_type: "home",
      },
      {
        household_id: householdId,
        title: "Year 4 trip to the Natural History Museum",
        event_date: daysFromNow(9),
        event_type: "school",
        person_id: leo.id,
        school_id: primary.id,
        notes: "Packed lunch, waterproof coat. Coach leaves 8:45.",
      },
      {
        household_id: householdId,
        title: "Boiler service (British Gas)",
        event_date: daysFromNow(12),
        event_type: "home",
        notes: "Engineer due between 12 and 6.",
      },
      {
        household_id: householdId,
        title: "Parents' evening",
        event_date: daysFromNow(16),
        event_type: "school",
        person_id: maya.id,
        school_id: secondary.id,
        notes: "Slots booked 5:10 to 6:00.",
      },
      {
        household_id: householdId,
        title: "Car MOT due",
        event_date: daysFromNow(27),
        event_type: "home",
      },
      {
        household_id: householdId,
        title: "Half-term starts",
        event_date: daysFromNow(22),
        event_type: "school",
        school_id: primary.id,
      },
      {
        household_id: householdId,
        title: "Dentist check-ups — whole family",
        event_date: daysFromNow(40),
        event_type: "other",
      },
    ]),
    "create dates"
  );

  const lists = must(
    await admin
      .from("shopping_lists")
      .insert([
        { household_id: householdId, name: "Weekly shop", sort_order: 0 },
        {
          household_id: householdId,
          name: "Leo's birthday",
          notes: "Party is Saturday at the leisure centre.",
          sort_order: 1,
        },
      ])
      .select("id, name"),
    "create lists"
  );
  const weekly = lists.find((list) => list.name === "Weekly shop");
  const birthday = lists.find((list) => list.name === "Leo's birthday");
  const items = (listId, titles, checkedCount = 0) =>
    titles.map((title, index) => ({
      list_id: listId,
      household_id: householdId,
      title,
      sort_order: index,
      checked: index < checkedCount,
      checked_at: index < checkedCount ? new Date().toISOString() : null,
    }));
  must(
    await admin.from("shopping_list_items").insert([
      ...items(
        weekly.id,
        ["Milk", "Wholemeal bread", "Eggs", "Bananas", "Chicken thighs", "Basmati rice", "Washing-up liquid", "Porridge oats"],
        3
      ),
      ...items(birthday.id, ["Candles", "Party bags x 12", "Football cake", "Balloons", "Thank-you cards"], 1),
    ]),
    "create list items"
  );

  must(
    await admin.from("household_routines").insert([
      { household_id: householdId, title: "Put the bins out", cadence: "weekly", weekday: 2, sort_order: 0 },
      { household_id: householdId, title: "Swimming lesson — Leo", cadence: "weekly", weekday: 3, notes: "4:30 at the leisure centre.", sort_order: 1 },
      { household_id: householdId, title: "Change the bedding", cadence: "fortnightly", weekday: 5, anchor_date: daysFromNow(0), sort_order: 2 },
      { household_id: householdId, title: "Check smoke alarms", cadence: "monthly", day_of_month: 1, sort_order: 3 },
    ]),
    "create routines"
  );

  const weekStart = mondayOfThisWeek();
  const meals = [
    ["Chicken traybake", "Chicken thighs, new potatoes, peppers"],
    ["Veggie chilli", "Kidney beans, tinned tomatoes, rice"],
    ["Fish fingers and peas", null],
    ["Pasta bake", "Penne, passata, mozzarella"],
    ["Homemade pizza", "Dough, passata, cheese, mushrooms"],
    ["Takeaway night", null],
    ["Roast chicken", "Chicken, carrots, potatoes, gravy"],
  ];
  must(
    await admin.from("household_meal_plans").insert(
      meals.map(([title, ingredients], weekday) => ({
        household_id: householdId,
        week_start: weekStart,
        weekday,
        title,
        ingredients_note: ingredients,
      }))
    ),
    "create meal plan"
  );

  const slot = (personId, weekday, start, end, subject, extra = {}) => ({
    household_id: householdId,
    person_id: personId,
    weekday,
    start_time: start,
    end_time: end,
    subject,
    ...extra,
  });
  must(
    await admin.from("person_timetable_slots").insert([
      slot(maya.id, 0, "08:50", "09:50", "Maths", { location: "M12" }),
      slot(maya.id, 0, "09:50", "10:50", "English", { location: "E4" }),
      slot(maya.id, 1, "08:50", "09:50", "Science", { location: "Lab 2" }),
      slot(maya.id, 1, "11:10", "12:10", "PE", { bring_kit: true, kit_label: "PE kit and trainers" }),
      slot(maya.id, 2, "08:50", "09:50", "French", { location: "L3" }),
      slot(maya.id, 3, "13:10", "14:10", "Food technology", { bring_ingredients: true, ingredients_note: "Flour, butter, two eggs" }),
      slot(maya.id, 4, "08:50", "09:50", "History", { location: "H1" }),
      slot(leo.id, 1, "13:15", "14:15", "PE", { bring_kit: true, kit_label: "PE kit" }),
      slot(leo.id, 4, "13:15", "14:15", "PE", { bring_kit: true, kit_label: "PE kit" }),
    ]),
    "create timetable"
  );
}

async function main() {
  const userId = await ensureUser();
  const householdId = await ensureHousehold(userId);

  const existingPeople = must(
    await admin
      .from("household_people")
      .select("id", { count: "exact", head: false })
      .eq("household_id", householdId)
      .limit(1),
    "read people"
  );

  if (existingPeople.length > 0 && !reset) {
    console.log(
      "The demo household already has data — left as it is. Re-run with --reset to clear and reseed it."
    );
    return;
  }
  if (reset) {
    await clearSampleData(householdId);
    console.log("Cleared the demo household's sample data.");
  }
  await seed(householdId, userId);
  console.log(`Seeded household ${householdId} for ${email}.`);
}

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
