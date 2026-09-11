-- Light meal week plan, today's "who's where" statuses, and guest pack notes
-- on the household. Member read/write throughout.

-- --- meal plans -----------------------------------------------------------
create table if not exists public.household_meal_plans (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  -- Monday of the week this plan belongs to (YYYY-MM-DD, Europe/London).
  week_start date not null,
  -- 0=Mon … 6=Sun within that week
  weekday smallint not null check (weekday >= 0 and weekday <= 6),
  title text not null,
  ingredients_note text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (household_id, week_start, weekday)
);

create index if not exists household_meal_plans_week_idx
  on public.household_meal_plans(household_id, week_start);

alter table public.household_meal_plans enable row level security;
grant select, insert, update, delete on public.household_meal_plans to authenticated;

create policy household_meal_plans_select on public.household_meal_plans
  for select to authenticated
  using (private.is_household_member(household_id));
create policy household_meal_plans_insert on public.household_meal_plans
  for insert to authenticated
  with check (private.is_household_member(household_id));
create policy household_meal_plans_update on public.household_meal_plans
  for update to authenticated
  using (private.is_household_member(household_id))
  with check (private.is_household_member(household_id));
create policy household_meal_plans_delete on public.household_meal_plans
  for delete to authenticated
  using (private.is_household_member(household_id));

-- --- who's where (today) --------------------------------------------------
create table if not exists public.person_day_status (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  person_id uuid not null references public.household_people(id) on delete cascade,
  -- Calendar day in Europe/London as YYYY-MM-DD
  status_date date not null,
  status_text text not null,
  updated_at timestamptz not null default now(),
  unique (person_id, status_date)
);

create index if not exists person_day_status_household_date_idx
  on public.person_day_status(household_id, status_date);

alter table public.person_day_status enable row level security;
grant select, insert, update, delete on public.person_day_status to authenticated;

create policy person_day_status_select on public.person_day_status
  for select to authenticated
  using (private.is_household_member(household_id));
create policy person_day_status_insert on public.person_day_status
  for insert to authenticated
  with check (
    private.is_household_member(household_id)
    and exists (
      select 1 from public.household_people p
      where p.id = person_day_status.person_id
        and p.household_id = person_day_status.household_id
    )
  );
create policy person_day_status_update on public.person_day_status
  for update to authenticated
  using (private.is_household_member(household_id))
  with check (
    private.is_household_member(household_id)
    and exists (
      select 1 from public.household_people p
      where p.id = person_day_status.person_id
        and p.household_id = person_day_status.household_id
    )
  );
create policy person_day_status_delete on public.person_day_status
  for delete to authenticated
  using (private.is_household_member(household_id));

-- --- guests pack on households --------------------------------------------
alter table public.households
  add column if not exists wifi_name text,
  add column if not exists wifi_password text,
  add column if not exists spare_key_note text,
  add column if not exists bin_day_note text,
  add column if not exists school_run_note text;
