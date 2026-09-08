-- Documents metadata. The extraction columns are filled by a later worker
-- session; uploads land here with extraction_status = 'pending'.

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  storage_path text not null,
  mime text,
  original_filename text not null,
  doc_type text,
  provider text,
  reference text,
  start_date date,
  end_date date,
  renewal_date date,
  amount numeric,
  currency text,
  extraction_confidence jsonb,
  extraction_status text not null default 'pending'
    check (extraction_status in ('pending','processing','complete','failed')),
  superseded_by uuid references public.documents(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists documents_household_id_idx on public.documents(household_id);
create index if not exists documents_property_id_idx on public.documents(property_id);

alter table public.documents enable row level security;

create policy documents_select on public.documents
  for select to authenticated
  using (public.is_household_member(household_id));
create policy documents_insert on public.documents
  for insert to authenticated
  with check (public.is_household_member(household_id));
create policy documents_update on public.documents
  for update to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
create policy documents_delete on public.documents
  for delete to authenticated
  using (public.is_household_member(household_id));
