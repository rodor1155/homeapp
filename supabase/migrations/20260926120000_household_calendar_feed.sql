-- Outbound ICS subscribe feed — one secret token per household for calendar apps.

create table if not exists public.household_calendar_feeds (
  household_id uuid primary key references public.households(id) on delete cascade,
  token text not null unique check (char_length(token) >= 32),
  created_at timestamptz not null default now(),
  rotated_at timestamptz,
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists household_calendar_feeds_token_idx
  on public.household_calendar_feeds(token);

alter table public.household_calendar_feeds enable row level security;

grant select, insert, update, delete on public.household_calendar_feeds to authenticated;
grant all on public.household_calendar_feeds to service_role;

create policy household_calendar_feeds_select on public.household_calendar_feeds
  for select to authenticated
  using (private.is_household_member(household_id));

create policy household_calendar_feeds_insert on public.household_calendar_feeds
  for insert to authenticated
  with check (private.is_household_member(household_id));

create policy household_calendar_feeds_update on public.household_calendar_feeds
  for update to authenticated
  using (private.is_household_member(household_id))
  with check (private.is_household_member(household_id));

create policy household_calendar_feeds_delete on public.household_calendar_feeds
  for delete to authenticated
  using (private.is_household_member(household_id));
