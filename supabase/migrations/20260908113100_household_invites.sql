-- Partner invites. Simple record only; the accept flow comes in a later session.

create table if not exists public.household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  email text not null,
  invited_by uuid references auth.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','accepted','revoked')),
  created_at timestamptz not null default now()
);
create index if not exists household_invites_household_id_idx on public.household_invites(household_id);
create index if not exists household_invites_email_idx on public.household_invites(lower(email));

alter table public.household_invites enable row level security;

create policy household_invites_select on public.household_invites
  for select to authenticated
  using (public.is_household_member(household_id));
create policy household_invites_insert on public.household_invites
  for insert to authenticated
  with check (
    public.is_household_member(household_id)
    and invited_by = (select auth.uid())
  );
create policy household_invites_update on public.household_invites
  for update to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
create policy household_invites_delete on public.household_invites
  for delete to authenticated
  using (public.is_household_member(household_id));
