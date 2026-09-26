-- Link invites for household sharing (part 1). Email invites stay; link rows carry
-- a single-use token instead of an address.
--
-- Active household: the app resolves "the current household" as the membership
-- with the latest created_at (most recently joined). After accepting a link
-- invite, the joiner lands in the household they just joined rather than the
-- empty signup household they may still hold.
--
-- Empty household on join: the joiner's own household is dropped only when it
-- has no other members and no household content (properties, documents,
-- people, schools, events, lists, renewals, calendar feed, reminders,
-- subscriptions, routines, meals, timetable slots, guest pack, or outstanding
-- invites). Conservative — two households is allowed when the joiner already
-- has anything filed.

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

alter table public.household_invites
  alter column email drop not null;

alter table public.household_invites
  add column if not exists token text unique
    check (token is null or char_length(token) >= 32),
  add column if not exists expires_at timestamptz,
  add column if not exists accepted_by uuid references auth.users(id) on delete set null,
  add column if not exists accepted_at timestamptz;

alter table public.household_invites
  drop constraint if exists household_invites_email_or_token_chk;

alter table public.household_invites
  add constraint household_invites_email_or_token_chk
  check (email is not null or token is not null);

create index if not exists household_invites_token_idx
  on public.household_invites(token)
  where token is not null;

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

-- Resolve a display name for an inviter — never the full email address.
create or replace function private.inviter_display_name(
  p_household_id uuid,
  p_user_id uuid
)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select hp.name
      from public.household_people hp
      where hp.household_id = p_household_id
        and hp.user_id = p_user_id
      order by hp.sort_order, hp.created_at
      limit 1
    ),
    nullif(trim(coalesce(
      u.raw_user_meta_data->>'full_name',
      u.raw_user_meta_data->>'name',
      ''
    )), ''),
    split_part(coalesce(u.email, 'someone'), '@', 1)
  )
  from auth.users u
  where u.id = p_user_id;
$$;

revoke all on function private.inviter_display_name(uuid, uuid) from public, anon, authenticated;

-- True when a household has nothing worth keeping beyond the lone member.
create or replace function private.household_is_empty(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    not exists (
      select 1 from public.household_members m
      where m.household_id = p_household_id
    )
    or (
      (select count(*) from public.household_members m
       where m.household_id = p_household_id) <= 1
      and not exists (
        select 1 from public.properties p where p.household_id = p_household_id
      )
      and not exists (
        select 1 from public.documents d where d.household_id = p_household_id
      )
      and not exists (
        select 1 from public.household_people hp where hp.household_id = p_household_id
      )
      and not exists (
        select 1 from public.schools s where s.household_id = p_household_id
      )
      and not exists (
        select 1 from public.household_events e where e.household_id = p_household_id
      )
      and not exists (
        select 1 from public.shopping_lists sl where sl.household_id = p_household_id
      )
      and not exists (
        select 1 from public.renewal_items r where r.household_id = p_household_id
      )
      and not exists (
        select 1 from public.household_calendar_feeds f
        where f.household_id = p_household_id
      )
      and not exists (
        select 1 from public.reminders r where r.household_id = p_household_id
      )
      and not exists (
        select 1 from public.subscriptions s where s.household_id = p_household_id
      )
      and not exists (
        select 1 from public.household_invites i
        where i.household_id = p_household_id
          and i.status = 'pending'
      )
      and not exists (
        select 1 from public.household_routines hr where hr.household_id = p_household_id
      )
      and not exists (
        select 1 from public.household_meal_plans mp
        where mp.household_id = p_household_id
      )
      and not exists (
        select 1 from public.person_timetable_slots pts
        where pts.household_id = p_household_id
      )
      and not exists (
        select 1 from public.person_day_status pds
        where pds.household_id = p_household_id
      )
      and not exists (
        select 1 from public.gmail_connections gc
        where gc.household_id = p_household_id
      )
      and not exists (
        select 1 from public.households h
        where h.id = p_household_id
          and (
            coalesce(h.wifi_name, '') <> ''
            or coalesce(h.wifi_password, '') <> ''
            or coalesce(h.spare_key_note, '') <> ''
            or coalesce(h.bin_day_note, '') <> ''
            or coalesce(h.school_run_note, '') <> ''
          )
      )
    );
$$;

revoke all on function private.household_is_empty(uuid) from public, anon, authenticated;

-- Drop the caller's own empty household after joining another one.
create or replace function private.leave_empty_household_if_applicable(
  p_user_id uuid,
  p_keep_household_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _other record;
begin
  for _other in
    select m.household_id
    from public.household_members m
    where m.user_id = p_user_id
      and m.household_id <> p_keep_household_id
  loop
    if private.household_is_empty(_other.household_id) then
      delete from public.household_members m
      where m.user_id = p_user_id
        and m.household_id = _other.household_id;
    end if;
  end loop;
end;
$$;

revoke all on function private.leave_empty_household_if_applicable(uuid, uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Email accept — reuse the shared empty-household helper
-- ---------------------------------------------------------------------------

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

  if _email is null or _invite.email is null or lower(_invite.email) <> _email then
    raise exception 'That invitation was sent to a different email address.';
  end if;

  insert into public.household_members (household_id, user_id, role)
  values (_invite.household_id, _user_id, 'member')
  on conflict (household_id, user_id) do nothing;

  perform private.leave_empty_household_if_applicable(_user_id, _invite.household_id);

  update public.household_invites
  set status = 'accepted',
      accepted_by = _user_id,
      accepted_at = now()
  where id = _invite.id;

  return _invite.household_id;
end;
$$;

revoke all on function public.accept_household_invite(uuid) from public, anon;
grant execute on function public.accept_household_invite(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Link preview (anon + authenticated)
-- ---------------------------------------------------------------------------

create or replace function public.invite_link_preview(p_token text)
returns table (
  household_name text,
  invited_by_name text,
  expires_at timestamptz,
  status text,
  already_member boolean
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  _invite public.household_invites;
  _uid uuid := auth.uid();
  _status text;
begin
  select * into _invite
  from public.household_invites
  where token = p_token;

  if not found then
    return;
  end if;

  if _invite.status = 'accepted' then
    _status := 'used';
  elsif _invite.status = 'revoked' then
    _status := 'revoked';
  elsif _invite.expires_at is not null and _invite.expires_at <= now() then
    _status := 'expired';
  else
    _status := 'valid';
  end if;

  return query
  select
    h.name,
    private.inviter_display_name(_invite.household_id, _invite.invited_by),
    _invite.expires_at,
    _status,
    _uid is not null
      and exists (
        select 1 from public.household_members m
        where m.household_id = _invite.household_id
          and m.user_id = _uid
      )
  from public.households h
  where h.id = _invite.household_id;
end;
$$;

revoke all on function public.invite_link_preview(text) from public;
grant execute on function public.invite_link_preview(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Link accept (authenticated)
-- ---------------------------------------------------------------------------

create or replace function public.accept_household_invite_link(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _user_id uuid := (select auth.uid());
  _invite public.household_invites;
  _already_member boolean;
begin
  if _user_id is null then
    raise exception 'You need to be signed in to join a household.';
  end if;

  select * into _invite
  from public.household_invites
  where token = p_token
  for update;

  if not found then
    raise exception 'That invite link could not be found.';
  end if;

  if _invite.status = 'revoked' then
    raise exception 'That invite link has been revoked. Ask for a new one.';
  end if;

  if _invite.status = 'accepted' then
    raise exception 'That invite link has already been used. Ask for a new one.';
  end if;

  if _invite.expires_at is not null and _invite.expires_at <= now() then
    raise exception 'That invite link has expired. Ask for a new one.';
  end if;

  if _invite.status <> 'pending' then
    raise exception 'That invite link is no longer valid.';
  end if;

  select exists (
    select 1 from public.household_members m
    where m.household_id = _invite.household_id
      and m.user_id = _user_id
  ) into _already_member;

  if _already_member then
    return _invite.household_id;
  end if;

  insert into public.household_members (household_id, user_id, role)
  values (_invite.household_id, _user_id, 'member');

  perform private.leave_empty_household_if_applicable(_user_id, _invite.household_id);

  update public.household_invites
  set status = 'accepted',
      accepted_by = _user_id,
      accepted_at = now()
  where id = _invite.id;

  return _invite.household_id;
end;
$$;

revoke all on function public.accept_household_invite_link(text) from public, anon;
grant execute on function public.accept_household_invite_link(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Grants + insert policy (invited_by must be the caller)
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on public.household_invites to authenticated;
grant all on public.household_invites to service_role;

drop policy if exists household_invites_insert on public.household_invites;
create policy household_invites_insert on public.household_invites
  for insert to authenticated
  with check (
    private.is_household_member(household_id)
    and invited_by = (select auth.uid())
  );
