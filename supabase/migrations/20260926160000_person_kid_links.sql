-- Kid view — one secret read-only link per child for a simplified schedule page.

create table if not exists public.person_kid_links (
  person_id uuid primary key references public.household_people(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  token text not null unique check (char_length(token) >= 32),
  created_at timestamptz not null default now(),
  rotated_at timestamptz,
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists person_kid_links_token_idx
  on public.person_kid_links(token);

create index if not exists person_kid_links_household_idx
  on public.person_kid_links(household_id);

alter table public.person_kid_links enable row level security;

revoke all on public.person_kid_links from anon;
grant select, insert, update, delete on public.person_kid_links to authenticated;
grant all on public.person_kid_links to service_role;

create policy person_kid_links_select on public.person_kid_links
  for select to authenticated
  using (private.is_household_member(household_id));

create policy person_kid_links_insert on public.person_kid_links
  for insert to authenticated
  with check (
    private.is_household_member(household_id)
    and exists (
      select 1
      from public.household_people p
      where p.id = person_id
        and p.household_id = person_kid_links.household_id
        and p.kind = 'child'
    )
  );

create policy person_kid_links_update on public.person_kid_links
  for update to authenticated
  using (private.is_household_member(household_id))
  with check (
    private.is_household_member(household_id)
    and exists (
      select 1
      from public.household_people p
      where p.id = person_id
        and p.household_id = person_kid_links.household_id
        and p.kind = 'child'
    )
  );

create policy person_kid_links_delete on public.person_kid_links
  for delete to authenticated
  using (private.is_household_member(household_id));
