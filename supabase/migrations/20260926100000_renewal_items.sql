-- Renewals & deadlines — passports, licences, MOT, insurance, boiler service, etc.
-- Per person or house-level. Member read/write throughout.

create table if not exists public.renewal_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  person_id uuid references public.household_people(id) on delete cascade,
  title text not null,
  kind text not null check (kind in (
    'passport', 'driving_licence', 'ghic', 'car_mot', 'car_tax', 'car_insurance',
    'home_insurance', 'boiler_service', 'tv_licence', 'other'
  )),
  due_date date,
  repeat_unit text not null default 'none' check (repeat_unit in ('none', 'month', 'year')),
  repeat_every smallint not null default 1 check (repeat_every between 1 and 20),
  remind_days smallint not null default 30 check (remind_days between 0 and 365),
  reference text,
  provider text,
  cost numeric(10, 2),
  notes text,
  document_id uuid references public.documents(id) on delete set null,
  source text not null default 'manual' check (source in ('manual', 'suggestion', 'document')),
  status text not null default 'active' check (status in ('active', 'done', 'dismissed')),
  last_done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint renewal_items_due_date_check check (
    status = 'dismissed' or due_date is not null
  )
);

create index if not exists renewal_items_household_status_due_idx
  on public.renewal_items(household_id, status, due_date);

create index if not exists renewal_items_person_idx
  on public.renewal_items(person_id);

create index if not exists renewal_items_document_idx
  on public.renewal_items(document_id);

create unique index if not exists renewal_items_dismissed_unique_idx
  on public.renewal_items (
    household_id,
    coalesce(person_id, '00000000-0000-0000-0000-000000000000'::uuid),
    kind
  )
  where status = 'dismissed';

alter table public.renewal_items enable row level security;

grant select, insert, update, delete on public.renewal_items to authenticated;
grant all on public.renewal_items to service_role;

create policy renewal_items_select on public.renewal_items
  for select to authenticated
  using (private.is_household_member(household_id));

create policy renewal_items_insert on public.renewal_items
  for insert to authenticated
  with check (
    private.is_household_member(household_id)
    and (
      person_id is null
      or exists (
        select 1 from public.household_people p
        where p.id = renewal_items.person_id
          and p.household_id = renewal_items.household_id
      )
    )
    and (
      document_id is null
      or exists (
        select 1 from public.documents d
        where d.id = renewal_items.document_id
          and d.household_id = renewal_items.household_id
      )
    )
  );

create policy renewal_items_update on public.renewal_items
  for update to authenticated
  using (private.is_household_member(household_id))
  with check (
    private.is_household_member(household_id)
    and (
      person_id is null
      or exists (
        select 1 from public.household_people p
        where p.id = renewal_items.person_id
          and p.household_id = renewal_items.household_id
      )
    )
    and (
      document_id is null
      or exists (
        select 1 from public.documents d
        where d.id = renewal_items.document_id
          and d.household_id = renewal_items.household_id
      )
    )
  );

create policy renewal_items_delete on public.renewal_items
  for delete to authenticated
  using (private.is_household_member(household_id));
