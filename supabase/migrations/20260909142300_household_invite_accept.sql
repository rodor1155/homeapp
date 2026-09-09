-- The accept side of household_invites. The table's RLS only lets existing
-- members read it, so an invitee reaches their own invite through these three
-- SECURITY DEFINER functions and nothing else. They are the only new privilege:
-- no policy is added or relaxed.

-- Pending invites addressed to the caller's own email, with the household name
-- and the inviter's email resolved for display.
create or replace function public.pending_invites_for_me()
returns table (
  invite_id uuid,
  household_id uuid,
  household_name text,
  invited_by_email text,
  created_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select i.id, i.household_id, h.name, u.email::text, i.created_at
  from public.household_invites i
  join public.households h on h.id = i.household_id
  left join auth.users u on u.id = i.invited_by
  where i.status = 'pending'
    and lower(i.email) = lower(nullif(auth.jwt() ->> 'email', ''))
  order by i.created_at;
$$;

revoke all on function public.pending_invites_for_me() from public, anon;
grant execute on function public.pending_invites_for_me() to authenticated;

-- Join the household the invite points at. Writes household_members, which has
-- no insert policy at all, hence SECURITY DEFINER. Returns the household id.
create or replace function public.accept_household_invite(p_invite_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _user_id uuid := (select auth.uid());
  _email text := lower(nullif(auth.jwt() ->> 'email', ''));
  _invite public.household_invites;
begin
  if _user_id is null then
    raise exception 'You need to be signed in to accept an invitation.';
  end if;

  select * into _invite
  from public.household_invites
  where id = p_invite_id;

  if not found then
    raise exception 'That invitation could not be found.';
  end if;

  if _invite.status <> 'pending' then
    raise exception 'That invitation has already been used.';
  end if;

  if _email is null or lower(_invite.email) <> _email then
    raise exception 'That invitation was sent to a different email address.';
  end if;

  insert into public.household_members (household_id, user_id, role)
  values (_invite.household_id, _user_id, 'member')
  on conflict (household_id, user_id) do nothing;

  -- Every signup is given a household of its own. If the caller never put
  -- anything in theirs, leave it on the way in, so they still hold exactly one
  -- household — which is what the app assumes. The membership delete fires
  -- prune_empty_household(), which removes the household row itself.
  delete from public.household_members m
  where m.user_id = _user_id
    and m.household_id <> _invite.household_id
    and not exists (
      select 1 from public.household_members other
      where other.household_id = m.household_id
        and other.user_id <> _user_id
    )
    and not exists (
      select 1 from public.properties p where p.household_id = m.household_id
    )
    and not exists (
      select 1 from public.documents d where d.household_id = m.household_id
    );

  update public.household_invites
  set status = 'accepted'
  where id = _invite.id;

  return _invite.household_id;
end;
$$;

revoke all on function public.accept_household_invite(uuid) from public, anon;
grant execute on function public.accept_household_invite(uuid) to authenticated;

-- Turn down an invite. Same ownership check; the row is simply marked revoked.
create or replace function public.decline_household_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _email text := lower(nullif(auth.jwt() ->> 'email', ''));
  _invite public.household_invites;
begin
  if (select auth.uid()) is null then
    raise exception 'You need to be signed in to decline an invitation.';
  end if;

  select * into _invite
  from public.household_invites
  where id = p_invite_id;

  if not found then
    raise exception 'That invitation could not be found.';
  end if;

  if _invite.status <> 'pending' then
    raise exception 'That invitation has already been used.';
  end if;

  if _email is null or lower(_invite.email) <> _email then
    raise exception 'That invitation was sent to a different email address.';
  end if;

  update public.household_invites
  set status = 'revoked'
  where id = _invite.id;
end;
$$;

revoke all on function public.decline_household_invite(uuid) from public, anon;
grant execute on function public.decline_household_invite(uuid) to authenticated;
