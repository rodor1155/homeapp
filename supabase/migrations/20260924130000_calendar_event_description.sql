alter table public.school_calendar_events
  add column if not exists description text,
  add column if not exists url text;

alter table public.household_calendar_events
  add column if not exists description text,
  add column if not exists url text;
