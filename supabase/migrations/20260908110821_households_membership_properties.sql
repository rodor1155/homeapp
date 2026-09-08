-- Households, membership, properties: per-household RLS + new-user provisioning.

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  locale text check (locale in ('UK','US')),
  created_at timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);
create index if not exists household_members_user_id_idx on public.household_members(user_id);

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  address text not null,
  type text,
  year_built integer,
  created_at timestamptz not null default now()
);
create index if not exists properties_household_id_idx on public.properties(household_id);

-- Membership check used by every policy. SECURITY DEFINER so it reads
-- household_members without tripping that table's own RLS (avoids recursion).
create or replace function public.is_household_member(_household_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.household_members m
    where m.household_id = _household_id
      and m.user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_household_member(uuid) from public;
grant execute on function public.is_household_member(uuid) to authenticated;

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.properties enable row level security;

-- households: members can read and rename their household. Creation happens only
-- through the new-user trigger below (SECURITY DEFINER, bypasses RLS).
create policy households_select on public.households
  for select to authenticated
  using (public.is_household_member(id));
create policy households_update on public.households
  for update to authenticated
  using (public.is_household_member(id))
  with check (public.is_household_member(id));

-- household_members: members can see who else is in the household. Writes come
-- from the trigger for now; the invite-accept flow will add policies later.
create policy household_members_select on public.household_members
  for select to authenticated
  using (public.is_household_member(household_id));

-- properties: full read/write for household members.
create policy properties_select on public.properties
  for select to authenticated
  using (public.is_household_member(household_id));
create policy properties_insert on public.properties
  for insert to authenticated
  with check (public.is_household_member(household_id));
create policy properties_update on public.properties
  for update to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
create policy properties_delete on public.properties
  for delete to authenticated
  using (public.is_household_member(household_id));

-- Every new auth user lands in their own household with a membership row.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _household_id uuid;
  _display text;
begin
  _display := coalesce(
    nullif(new.raw_user_meta_data->>'full_name', ''),
    nullif(new.raw_user_meta_data->>'name', ''),
    split_part(coalesce(new.email, 'my'), '@', 1)
  );

  insert into public.households (name)
  values (_display || '''s household')
  returning id into _household_id;

  insert into public.household_members (household_id, user_id, role)
  values (_household_id, new.id, 'owner');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
