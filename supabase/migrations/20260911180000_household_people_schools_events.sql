-- The people in the household (most of whom will never be app users), the
-- schools their children go to, and the household's own key dates.
--
-- Members get full read/write on all three: unlike documents and reminders,
-- nothing here is written by a worker, so every policy is a plain member
-- check through private.is_household_member (the public. variant was dropped
-- in 20260908111017_harden_security_definer_helpers.sql).
--
-- Schools come first because a person points at one.

create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  address text,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists schools_household_id_idx on public.schools(household_id);

alter table public.schools enable row level security;

-- Stated rather than left to the schema's default privileges, so a member
-- can't end up with an empty list instead of an error.
grant select, insert, update, delete on public.schools to authenticated;

create policy schools_select on public.schools
  for select to authenticated
  using (private.is_household_member(household_id));
create policy schools_insert on public.schools
  for insert to authenticated
  with check (private.is_household_member(household_id));
create policy schools_update on public.schools
  for update to authenticated
  using (private.is_household_member(household_id))
  with check (private.is_household_member(household_id));
create policy schools_delete on public.schools
  for delete to authenticated
  using (private.is_household_member(household_id));

-- A person in the household. `user_id` is optional and only set when this
-- person also signs in — household_members stays the record of who has an
-- account, this table is the record of who lives here.
--
-- School is one column pair rather than a join table: a child is at one
-- school at a time, and a history of schools is not something this slice
-- asks for. Promote it to person_schools if that changes.
create table if not exists public.household_people (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  kind text not null default 'adult' check (kind in ('adult','child','other')),
  birthday date,
  school_id uuid references public.schools(id) on delete set null,
  year_group text,
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists household_people_household_id_idx
  on public.household_people(household_id);
create index if not exists household_people_school_id_idx
  on public.household_people(school_id);

alter table public.household_people enable row level security;

grant select, insert, update, delete on public.household_people to authenticated;

create policy household_people_select on public.household_people
  for select to authenticated
  using (private.is_household_member(household_id));
create policy household_people_insert on public.household_people
  for insert to authenticated
  with check (private.is_household_member(household_id));
create policy household_people_update on public.household_people
  for update to authenticated
  using (private.is_household_member(household_id))
  with check (private.is_household_member(household_id));
create policy household_people_delete on public.household_people
  for delete to authenticated
  using (private.is_household_member(household_id));

-- Key dates somebody typed in: term starts, the boiler service, a wedding.
--
-- Birthdays are NOT mirrored in here — the app derives the next one from
-- household_people.birthday so there is only ever one copy of it. The
-- 'birthday' type is still allowed for a birthday of someone who isn't in
-- the household at all.
create table if not exists public.household_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null,
  event_date date not null,
  event_type text not null default 'home'
    check (event_type in ('birthday','school','home','other')),
  person_id uuid references public.household_people(id) on delete set null,
  school_id uuid references public.schools(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);
-- The dashboard's only query: this household's dates, soonest first.
create index if not exists household_events_household_date_idx
  on public.household_events(household_id, event_date);

alter table public.household_events enable row level security;

grant select, insert, update, delete on public.household_events to authenticated;

create policy household_events_select on public.household_events
  for select to authenticated
  using (private.is_household_member(household_id));
create policy household_events_insert on public.household_events
  for insert to authenticated
  with check (private.is_household_member(household_id));
create policy household_events_update on public.household_events
  for update to authenticated
  using (private.is_household_member(household_id))
  with check (private.is_household_member(household_id));
create policy household_events_delete on public.household_events
  for delete to authenticated
  using (private.is_household_member(household_id));
