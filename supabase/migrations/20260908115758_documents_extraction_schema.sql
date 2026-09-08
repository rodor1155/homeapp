-- Extraction output columns, wider status set, and the chunked-text table.

alter table public.documents
  add column if not exists key_contact_name text,
  add column if not exists key_contact_phone text;

do $$
declare _c text;
begin
  select conname into _c
    from pg_constraint
   where conrelid = 'public.documents'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%extraction_status%';
  if _c is not null then
    execute format('alter table public.documents drop constraint %I', _c);
  end if;
end $$;

alter table public.documents
  add constraint documents_extraction_status_check
  check (extraction_status in (
    'pending','processing','extracted','needs_review','confirmed','failed'
  ));

create table if not exists public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  created_at timestamptz not null default now(),
  unique (document_id, chunk_index)
);
create index if not exists document_chunks_document_id_idx
  on public.document_chunks(document_id);

alter table public.document_chunks enable row level security;

-- Read access follows the parent document's household. Writes are service-role
-- only (the extraction worker), so there is no write policy.
create policy document_chunks_select on public.document_chunks
  for select to authenticated
  using (exists (
    select 1 from public.documents d
    where d.id = document_chunks.document_id
      and private.is_household_member(d.household_id)
  ));
