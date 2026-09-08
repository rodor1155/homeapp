-- Move the membership check into a schema PostgREST does not expose, and make
-- the new-user trigger function non-callable over the API. Clears database
-- linter findings 0028/0029 for our helpers.

create schema if not exists private;
grant usage on schema private to authenticated, service_role;

create or replace function private.is_household_member(_household_id uuid)
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

revoke all on function private.is_household_member(uuid) from public;
grant execute on function private.is_household_member(uuid) to authenticated, service_role;

-- Repoint every policy at private.is_household_member.
drop policy households_select on public.households;
drop policy households_update on public.households;
create policy households_select on public.households
  for select to authenticated using (private.is_household_member(id));
create policy households_update on public.households
  for update to authenticated
  using (private.is_household_member(id)) with check (private.is_household_member(id));

drop policy household_members_select on public.household_members;
create policy household_members_select on public.household_members
  for select to authenticated using (private.is_household_member(household_id));

drop policy properties_select on public.properties;
drop policy properties_insert on public.properties;
drop policy properties_update on public.properties;
drop policy properties_delete on public.properties;
create policy properties_select on public.properties
  for select to authenticated using (private.is_household_member(household_id));
create policy properties_insert on public.properties
  for insert to authenticated with check (private.is_household_member(household_id));
create policy properties_update on public.properties
  for update to authenticated
  using (private.is_household_member(household_id)) with check (private.is_household_member(household_id));
create policy properties_delete on public.properties
  for delete to authenticated using (private.is_household_member(household_id));

drop policy household_invites_select on public.household_invites;
drop policy household_invites_insert on public.household_invites;
drop policy household_invites_update on public.household_invites;
drop policy household_invites_delete on public.household_invites;
create policy household_invites_select on public.household_invites
  for select to authenticated using (private.is_household_member(household_id));
create policy household_invites_insert on public.household_invites
  for insert to authenticated
  with check (private.is_household_member(household_id) and invited_by = (select auth.uid()));
create policy household_invites_update on public.household_invites
  for update to authenticated
  using (private.is_household_member(household_id)) with check (private.is_household_member(household_id));
create policy household_invites_delete on public.household_invites
  for delete to authenticated using (private.is_household_member(household_id));

drop policy documents_select on public.documents;
drop policy documents_insert on public.documents;
drop policy documents_update on public.documents;
drop policy documents_delete on public.documents;
create policy documents_select on public.documents
  for select to authenticated using (private.is_household_member(household_id));
create policy documents_insert on public.documents
  for insert to authenticated with check (private.is_household_member(household_id));
create policy documents_update on public.documents
  for update to authenticated
  using (private.is_household_member(household_id)) with check (private.is_household_member(household_id));
create policy documents_delete on public.documents
  for delete to authenticated using (private.is_household_member(household_id));

drop policy "documents_bucket_select" on storage.objects;
drop policy "documents_bucket_insert" on storage.objects;
drop policy "documents_bucket_update" on storage.objects;
drop policy "documents_bucket_delete" on storage.objects;
create policy "documents_bucket_select" on storage.objects
  for select to authenticated using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    and private.is_household_member(((storage.foldername(name))[1])::uuid)
  );
create policy "documents_bucket_insert" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    and private.is_household_member(((storage.foldername(name))[1])::uuid)
  );
create policy "documents_bucket_update" on storage.objects
  for update to authenticated using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    and private.is_household_member(((storage.foldername(name))[1])::uuid)
  ) with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    and private.is_household_member(((storage.foldername(name))[1])::uuid)
  );
create policy "documents_bucket_delete" on storage.objects
  for delete to authenticated using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    and private.is_household_member(((storage.foldername(name))[1])::uuid)
  );

drop function public.is_household_member(uuid);

revoke all on function public.handle_new_user() from public, anon, authenticated;
