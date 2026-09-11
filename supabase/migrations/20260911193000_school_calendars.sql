-- A school's term calendar, linked as an ICS feed and cached here.
--
-- The feed itself is fetched server-side (lib/school-calendar.ts), so the
-- cache table is written by the service role only — like reminders and
-- document_chunks, it has no insert/update/delete policy. Members read it.
--
-- Membership is checked with private.is_household_member — the public.
-- variant was dropped in 20260908111017_harden_security_definer_helpers.sql.

-- Where the feed lives, what to call it, and how the last fetch went. The
-- error is kept on the school rather than thrown away so /family can say why
-- a calendar has gone quiet; the last successful sync time is left alone by a
-- failure, so "last synced" stays honest.
alter table public.schools
  add column if not exists calendar_url text,
  add column if not exists calendar_title text,
  add column if not exists calendar_last_synced_at timestamptz,
  add column if not exists calendar_last_error text;

-- One row per occurrence inside the window the sync fetches (today → +120
-- days), not the whole feed: this is a cache, dropped and rebuilt on every
-- sync, never the source of truth. `household_id` is denormalised off the
-- school so the dashboard's "coming up" query is one indexed read.
--
-- `uid` carries the feed's UID with the occurrence appended for a recurring
-- event, which is what makes the unique constraint meaningful — a feed that
-- repeats the same UID for one occurrence can't land twice.
create table if not exists public.school_calendar_events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  uid text,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default true,
  location text,
  created_at timestamptz not null default now(),
  unique (school_id, uid)
);
-- The dashboard's and /family's only query: this household's school dates,
-- soonest first.
create index if not exists school_calendar_events_household_starts_idx
  on public.school_calendar_events(household_id, starts_at);
create index if not exists school_calendar_events_school_id_idx
  on public.school_calendar_events(school_id);

alter table public.school_calendar_events enable row level security;

-- Stated rather than left to the schema's default privileges, so a member
-- can't end up with an empty list instead of an error.
grant select on public.school_calendar_events to authenticated;

-- Read-only for members. Rows come from syncSchoolCalendar() on the service
-- role, so there is no insert, update or delete policy.
create policy school_calendar_events_select on public.school_calendar_events
  for select to authenticated
  using (private.is_household_member(household_id));
