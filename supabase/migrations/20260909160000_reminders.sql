-- Renewal reminders: the schedule reference data, one reminder per dated
-- document, and a log of what was actually sent. Reminder rows and event rows
-- are written by the service role only (the sync helper and the cron route),
-- so neither table has an insert policy.
--
-- Membership is checked with private.is_household_member — the public.
-- variant was dropped in 20260908111017_harden_security_definer_helpers.sql.

-- How many days before a due date to nudge, per category and locale. Reference
-- data: readable by any signed-in user, written only by migrations. RLS is on
-- because the ensure_rls event trigger turns it on for every new table anyway,
-- so the read has to be granted explicitly.
create table if not exists public.reminder_rules (
  category text not null,
  locale text not null check (locale in ('UK','US')),
  offsets int[] not null,
  primary key (category, locale)
);

alter table public.reminder_rules enable row level security;

grant select on public.reminder_rules to authenticated;

create policy reminder_rules_select on public.reminder_rules
  for select to authenticated
  using (true);

-- Categories mirror CATEGORIES in lib/home-overview.ts; 'default' is the
-- fallback the code uses when a category has no row. Most things want a long
-- runway; bills, vehicles and subscriptions turn round quickly enough that a
-- two-month warning is just noise.
insert into public.reminder_rules (category, locale, offsets)
select r.category, l.locale, r.offsets
from (values
  ('default'::text,            '{60,30,7,0}'::int[]),
  ('Insurance',                '{60,30,7,0}'::int[]),
  ('Utilities & bills',        '{30,7,0}'::int[]),
  ('Vehicle',                  '{30,7,0}'::int[]),
  ('Property & compliance',    '{60,30,7,0}'::int[]),
  ('Warranties & appliances',  '{60,30,7,0}'::int[]),
  ('Subscriptions & services', '{30,7,0}'::int[]),
  ('Other',                    '{60,30,7,0}'::int[])
) as r(category, offsets)
cross join (values ('UK'::text), ('US')) as l(locale)
on conflict (category, locale) do nothing;

-- One row per document per kind of date. `offsets` is copied off the rule at
-- sync time so a later rule change never silently rewrites live schedules.
create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  kind text not null check (kind in ('renewal','end')),
  due_date date not null,
  offsets int[] not null,
  status text not null default 'scheduled'
    check (status in ('scheduled','sent','cancelled')),
  created_at timestamptz not null default now(),
  unique (document_id, kind)
);
create index if not exists reminders_household_id_idx on public.reminders(household_id);
-- The cron route's only query: everything still scheduled and not yet past.
create index if not exists reminders_status_due_date_idx
  on public.reminders(status, due_date);

alter table public.reminders enable row level security;

-- Members can see, silence and clear their own reminders. Inserts come from
-- syncRemindersForDocument() on the service role, so there is no insert policy.
create policy reminders_select on public.reminders
  for select to authenticated
  using (private.is_household_member(household_id));
create policy reminders_update on public.reminders
  for update to authenticated
  using (private.is_household_member(household_id))
  with check (private.is_household_member(household_id));
create policy reminders_delete on public.reminders
  for delete to authenticated
  using (private.is_household_member(household_id));

-- One row per reminder per offset actually fired. The unique constraint is
-- what stops the daily cron sending the same nudge twice.
create table if not exists public.reminder_events (
  id uuid primary key default gen_random_uuid(),
  reminder_id uuid not null references public.reminders(id) on delete cascade,
  offset_days int not null,
  channel text not null default 'email',
  result text not null,
  sent_at timestamptz not null default now(),
  unique (reminder_id, offset_days)
);
create index if not exists reminder_events_reminder_id_idx
  on public.reminder_events(reminder_id);

alter table public.reminder_events enable row level security;

-- Read-only, through the parent reminder's household. Writes are service-role
-- only (the cron route).
create policy reminder_events_select on public.reminder_events
  for select to authenticated
  using (exists (
    select 1 from public.reminders r
    where r.id = reminder_events.reminder_id
      and private.is_household_member(r.household_id)
  ));
