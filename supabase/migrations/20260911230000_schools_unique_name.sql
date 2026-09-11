-- Dedupe school names within a household, then enforce uniqueness on
-- lower(trim(name)). Safe to re-run: the unique index is IF NOT EXISTS.
--
-- Apply on prod (project fybpmpnfocaxhqiwiyhs) when ready:
--   supabase db push
-- or run this file in the SQL editor. Until then, app code still select-or-
-- inserts by normalised name.

-- Re-point children and events at the oldest school of each duplicate group.
with ranked as (
  select
    id,
    household_id,
    lower(trim(name)) as key,
    row_number() over (
      partition by household_id, lower(trim(name))
      order by created_at asc, id asc
    ) as rn,
    first_value(id) over (
      partition by household_id, lower(trim(name))
      order by created_at asc, id asc
    ) as keep_id
  from public.schools
  where name is not null and trim(name) <> ''
)
update public.household_people p
set school_id = r.keep_id
from ranked r
where p.school_id = r.id
  and r.rn > 1;

with ranked as (
  select
    id,
    household_id,
    lower(trim(name)) as key,
    row_number() over (
      partition by household_id, lower(trim(name))
      order by created_at asc, id asc
    ) as rn,
    first_value(id) over (
      partition by household_id, lower(trim(name))
      order by created_at asc, id asc
    ) as keep_id
  from public.schools
  where name is not null and trim(name) <> ''
)
update public.household_events e
set school_id = r.keep_id
from ranked r
where e.school_id = r.id
  and r.rn > 1;

-- Drop duplicate school rows (cascades calendar event cache).
with ranked as (
  select
    id,
    row_number() over (
      partition by household_id, lower(trim(name))
      order by created_at asc, id asc
    ) as rn
  from public.schools
  where name is not null and trim(name) <> ''
)
delete from public.schools s
using ranked r
where s.id = r.id
  and r.rn > 1;

create unique index if not exists schools_household_name_unique
  on public.schools (household_id, lower(trim(name)));
