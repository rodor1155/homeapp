-- A household with no members is unreachable (RLS denies everyone). Delete it
-- when its last membership row goes away — including when an auth.users delete
-- cascades through household_members. Cascades on to properties, documents and
-- invites.

create or replace function public.prune_empty_household()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.household_members where household_id = old.household_id
  ) then
    delete from public.households where id = old.household_id;
  end if;
  return old;
end;
$$;

revoke all on function public.prune_empty_household() from public, anon, authenticated;

drop trigger if exists prune_empty_household_after_delete on public.household_members;
create trigger prune_empty_household_after_delete
  after delete on public.household_members
  for each row execute function public.prune_empty_household();

-- Clean up households already orphaned before this trigger existed.
delete from public.households h
where not exists (
  select 1 from public.household_members m where m.household_id = h.id
);
