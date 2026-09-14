-- Gmail read-only import: OAuth tokens and scan candidates.
--
-- Tokens live here but are never exposed to the browser — no RLS policies
-- for authenticated; the app reads/writes via the service role only.
-- Candidates are household-scoped and reviewable by members before anything
-- is written to documents / Storage.

create table if not exists public.gmail_connections (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  gmail_address text not null,
  access_token text not null,
  refresh_token text not null,
  token_expires_at timestamptz,
  last_scan_at timestamptz,
  last_scan_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id)
);

create index if not exists gmail_connections_household_id_idx
  on public.gmail_connections(household_id);

alter table public.gmail_connections enable row level security;
-- No grants/policies for authenticated — service role only.

create table if not exists public.gmail_import_candidates (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  connection_id uuid not null references public.gmail_connections(id) on delete cascade,
  gmail_message_id text not null,
  gmail_attachment_id text not null,
  filename text not null,
  subject text,
  sender text,
  received_at timestamptz,
  suggested_category text,
  status text not null default 'pending'
    check (status in ('pending', 'imported', 'dismissed', 'failed')),
  document_id uuid references public.documents(id) on delete set null,
  import_error text,
  created_at timestamptz not null default now(),
  unique (connection_id, gmail_message_id, gmail_attachment_id)
);

create index if not exists gmail_import_candidates_household_status_idx
  on public.gmail_import_candidates(household_id, status);

alter table public.gmail_import_candidates enable row level security;

grant select, update, delete on public.gmail_import_candidates to authenticated;

create policy gmail_import_candidates_select on public.gmail_import_candidates
  for select to authenticated
  using (private.is_household_member(household_id));

create policy gmail_import_candidates_update on public.gmail_import_candidates
  for update to authenticated
  using (private.is_household_member(household_id))
  with check (private.is_household_member(household_id));

create policy gmail_import_candidates_delete on public.gmail_import_candidates
  for delete to authenticated
  using (private.is_household_member(household_id));
