-- A calendar the household shares, linked as an ICS feed and cached here.
--
-- The same arrangement as school_calendars, one level up: a school's feed is
-- the school's, this one is the household's own (the family Google calendar,
-- a sports club's fixtures, a shared rota). The feed is fetched server-side
-- (lib/household-calendar.ts), so the cache table is written by the service
-- role only — like reminders and school_calendar_events, it has no
-- insert/update/delete policy. Members read it.
--
-- Membership is checked with private.is_household_member — the public.
-- variant was dropped in 20260908111017_harden_security_definer_helpers.sql.

-- What the household called it, where the feed lives, and how the last fetch
-- went. `calendar_title` is the feed's own name (X-WR-CALNAME), only borrowed
-- when nobody typed one; the error is kept rather than thrown away so
-- /calendar can say why a feed has gone quiet, and the last successful sync
-- time is left alone by a failure so "last read" stays honest.
create table if not exists public.household_calendars (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  calendar_url text,
  calendar_title text,
  calendar_last_synced_at timestamptz,
  calendar_last_error text,
  created_at timestamptz not null default now()
);
create index if not exists household_calendars_household_id_idx
  on public.household_calendars(household_id);

alter table public.household_calendars enable row level security;

grant select, insert, update, delete on public.household_calendars to authenticated;

-- Plain member read/write, like household_events: a household looks after its
-- own feeds. Nothing on this table is written by a worker except the
-- `calendar_*` marks, which the service role updates.
create policy household_calendars_select on public.household_calendars
  for select to authenticated
  using (private.is_household_member(household_id));

create policy household_calendars_insert on public.household_calendars
  for insert to authenticated
  with check (private.is_household_member(household_id));

create policy household_calendars_update on public.household_calendars
  for update to authenticated
  using (private.is_household_member(household_id))
  with check (private.is_household_member(household_id));

create policy household_calendars_delete on public.household_calendars
  for delete to authenticated
  using (private.is_household_member(household_id));

-- One row per occurrence inside the window the sync fetches (today → +120
-- days), not the whole feed: this is a cache, dropped and rebuilt on every
-- sync, never the source of truth. `household_id` is denormalised off the
-- calendar so the month grid's query is one indexed read.
--
-- `uid` carries the feed's UID with the occurrence appended for a recurring
-- event, which is what makes the unique constraint meaningful — a feed that
-- repeats the same UID for one occurrence can't land twice.
create table if not exists public.household_calendar_events (
  id uuid primary key default gen_random_uuid(),
  calendar_id uuid not null references public.household_calendars(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  uid text,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default true,
  location text,
  created_at timestamptz not null default now(),
  unique (calendar_id, uid)
);
-- The month grid's and the dashboard's only query: this household's shared
-- dates, soonest first.
create index if not exists household_calendar_events_household_starts_idx
  on public.household_calendar_events(household_id, starts_at);
create index if not exists household_calendar_events_calendar_id_idx
  on public.household_calendar_events(calendar_id);

alter table public.household_calendar_events enable row level security;

-- Stated rather than left to the schema's default privileges, so a member
-- can't end up with an empty list instead of an error.
grant select on public.household_calendar_events to authenticated;

-- Read-only for members. Rows come from syncHouseholdCalendar() on the
-- service role, so there is no insert, update or delete policy.
create policy household_calendar_events_select on public.household_calendar_events
  for select to authenticated
  using (private.is_household_member(household_id));
