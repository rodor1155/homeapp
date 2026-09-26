-- When an owner leaves but the household still has members, promote the
-- longest-standing remaining member to owner. Composes with prune_empty_household:
-- if no members remain, there is nothing to promote.

create or replace function private.transfer_household_ownership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role = 'owner' then
    if exists (
      select 1
      from public.household_members m
      where m.household_id = old.household_id
    ) and not exists (
      select 1
      from public.household_members m
      where m.household_id = old.household_id
        and m.role = 'owner'
    ) then
      update public.household_members
      set role = 'owner'
      where household_id = old.household_id
        and user_id = (
          select m.user_id
          from public.household_members m
          where m.household_id = old.household_id
          order by m.created_at asc, m.user_id asc
          limit 1
        );
    end if;
  end if;
  return old;
end;
$$;

revoke all on function private.transfer_household_ownership() from public, anon, authenticated;

drop trigger if exists transfer_household_ownership_after_delete on public.household_members;
create trigger transfer_household_ownership_after_delete
  after delete on public.household_members
  for each row execute function private.transfer_household_ownership();
