-- Recurring household beats: bin night, library books, recycling.
-- Plain member read/write; expand into Coming up in app code (Europe/London).

create table if not exists public.household_routines (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null,
  -- weekly | fortnightly | monthly
  cadence text not null default 'weekly'
    check (cadence in ('weekly', 'fortnightly', 'monthly')),
  -- 0=Mon … 6=Sun; required for weekly/fortnightly
  weekday smallint check (weekday is null or (weekday >= 0 and weekday <= 6)),
  -- 1–28 for monthly; null otherwise
  day_of_month smallint check (
    day_of_month is null or (day_of_month >= 1 and day_of_month <= 28)
  ),
  -- Anchor for fortnightly (any past occurrence date as YYYY-MM-DD).
  anchor_date date,
  notes text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint household_routines_weekly_weekday
    check (
      (cadence in ('weekly', 'fortnightly') and weekday is not null)
      or (cadence = 'monthly' and day_of_month is not null)
    )
);

create index if not exists household_routines_household_idx
  on public.household_routines(household_id, active, sort_order);

alter table public.household_routines enable row level security;

grant select, insert, update, delete on public.household_routines to authenticated;

create policy household_routines_select on public.household_routines
  for select to authenticated
  using (private.is_household_member(household_id));
create policy household_routines_insert on public.household_routines
  for insert to authenticated
  with check (private.is_household_member(household_id));
create policy household_routines_update on public.household_routines
  for update to authenticated
  using (private.is_household_member(household_id))
  with check (private.is_household_member(household_id));
create policy household_routines_delete on public.household_routines
  for delete to authenticated
  using (private.is_household_member(household_id));
