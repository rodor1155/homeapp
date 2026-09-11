-- Relation on people (wife/husband/daughter/…) and postcode on schools for
-- the address picker. year_group already exists as text.

alter table public.household_people
  add column if not exists relation text;

alter table public.schools
  add column if not exists postcode text;

-- Soft check: only known relation keys (or null). Blank/unknown cleared in app.
alter table public.household_people
  drop constraint if exists household_people_relation_check;

alter table public.household_people
  add constraint household_people_relation_check
  check (
    relation is null
    or relation in (
      'wife','husband','partner','mother','father','daughter','son',
      'sister','brother','grandmother','grandfather','guardian','other'
    )
  );
