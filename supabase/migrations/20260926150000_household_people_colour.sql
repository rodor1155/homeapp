-- Member colours for household_people — a curated palette keyed by text so the
-- app can tint chips, deck edges and avatars per person. Existing rows are
-- backfilled deterministically per household; new rows get a colour in the app
-- (first unused in the household, else cycle). No column default — nullable
-- until the app writes one.

alter table public.household_people
  add column if not exists colour text
  check (
    colour is null
    or colour in (
      'amber',
      'rose',
      'sky',
      'sage',
      'lilac',
      'coral',
      'teal',
      'slate'
    )
  );

-- Backfill: sort_order, created_at, id within each household → palette index.
-- First three match the legacy amber / rose / sky assignment.
with ranked as (
  select
    id,
    (row_number() over (
      partition by household_id
      order by sort_order, created_at, id
    ) - 1) % 8 as colour_idx
  from public.household_people
)
update public.household_people hp
set colour = (
  array[
    'amber',
    'rose',
    'sky',
    'sage',
    'lilac',
    'coral',
    'teal',
    'slate'
  ]
)[r.colour_idx + 1]
from ranked r
where hp.id = r.id
  and hp.colour is null;

grant select, insert, update, delete on public.household_people to authenticated;
grant all on public.household_people to service_role;
