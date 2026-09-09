-- Who is in a household, by email. household_members is readable by members,
-- but auth.users is not exposed at all, so the addresses have to come from a
-- SECURITY DEFINER function. This is the only new privilege the settings page
-- needs: no policy is added or relaxed.
--
-- The guard is private.is_household_member(), so a caller only ever sees the
-- emails of a household they are themselves in.
create or replace function public.household_member_emails(p_household_id uuid)
returns table (
  user_id uuid,
  email text
)
language sql
security definer
stable
set search_path = public
as $$
  select m.user_id, u.email::text
  from public.household_members m
  left join auth.users u on u.id = m.user_id
  where m.household_id = p_household_id
    and private.is_household_member(p_household_id)
  order by m.created_at;
$$;

revoke all on function public.household_member_emails(uuid) from public, anon;
grant execute on function public.household_member_emails(uuid) to authenticated;
