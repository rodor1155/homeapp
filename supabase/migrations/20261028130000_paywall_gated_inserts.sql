-- Close the free-tier paywall bypass on household_invites and household_events.
--
-- Inviting someone and adding a family date are part of Hearth Household (the
-- paid plan). The server actions check that with getEntitlements() before
-- they write, but until now the `authenticated` role could INSERT into both
-- tables directly through the Data API (PostgREST), skipping that check: a
-- free household could create its own invite link, or add dates, with nothing
-- more than its session token.
--
-- After this migration:
--   * `authenticated` (and `anon`, which never had it after
--     20261020120000_explicit_data_api_grants.sql — restated here) has no
--     INSERT on either table. The insert RLS policies are dropped with it, so
--     nothing reads as "allowed" if a grant ever comes back by accident.
--   * Rows are created through two SECURITY DEFINER functions,
--     public.create_household_invite() and public.create_household_event(),
--     which check the caller is a member of the household AND that the
--     household is on the paid plan, then insert and return the row.
--   * UPDATE is narrowed to the columns the app actually changes, and an
--     invite can only be moved from 'pending' to 'revoked' by a client —
--     otherwise a free household could re-open an old revoked invite (or move
--     a date in from another household) and get the same effect as an insert.
--   * service_role keeps ALL on both tables (the admin client: seed scripts,
--     verify-flows, and the server-decided paid cases below).
--
-- "Paid" here is the database half of lib/billing.ts getEntitlements():
--   * Stripe: public.subscriptions.status in ('active', 'trialing')
--     (PAID_STATUSES in lib/billing.ts).
--   * App Store: a public.app_store_subscriptions row that is not revoked and
--     whose access (the later of expires_at and grace_period_expires_at —
--     accessEndsAt() in lib/appstore/entitlement.ts) runs past now().
-- Two paid cases are decided by the server's environment and cannot be seen
-- from the database: billing switched off on a deployment ("unconfigured")
-- and the App Review demo account ("review_demo", REVIEW_DEMO_EMAIL). For
-- those the server actions insert with the service-role client after their
-- own membership + entitlement check (lib/gated-inserts.ts) — the client can
-- never claim either.

-- ---------------------------------------------------------------------------
-- The paid-plan check
-- ---------------------------------------------------------------------------

create or replace function private.household_has_paid_plan(p_household_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.subscriptions s
    where s.household_id = p_household_id
      and s.status in ('active', 'trialing')
  ) then
    return true;
  end if;

  -- app_store_subscriptions arrives in 20261009100000; guard so this function
  -- still answers (Stripe only) on a database where that is not applied yet.
  -- PL/pgSQL plans the query below only when it runs, so a missing table is
  -- never touched.
  if pg_catalog.to_regclass('public.app_store_subscriptions') is not null then
    if exists (
      select 1
      from public.app_store_subscriptions a
      where a.household_id = p_household_id
        and a.revoked_at is null
        and pg_catalog.greatest(a.expires_at, a.grace_period_expires_at) > pg_catalog.now()
    ) then
      return true;
    end if;
  end if;

  return false;
end;
$$;

revoke all on function private.household_has_paid_plan(uuid) from public, anon, authenticated;
grant execute on function private.household_has_paid_plan(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- household_invites
-- ---------------------------------------------------------------------------

revoke insert on public.household_invites from anon, authenticated;
drop policy if exists household_invites_insert on public.household_invites;

-- The app only ever revokes (status) from a client; accepting and declining
-- go through SECURITY DEFINER RPCs that run as the owner.
revoke update on public.household_invites from anon, authenticated;
grant update (status) on public.household_invites to authenticated;

create or replace function private.household_invites_client_update_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Only a direct Data API write runs as `authenticated`; the accept/decline
  -- RPCs are SECURITY DEFINER and run as their owner, so they are untouched.
  if current_user = 'authenticated'
     and not (old.status = 'pending' and new.status = 'revoked') then
    raise exception 'An invitation can only be withdrawn.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.household_invites_client_update_guard() from public, anon, authenticated;

drop trigger if exists household_invites_client_update_guard on public.household_invites;
create trigger household_invites_client_update_guard
  before update on public.household_invites
  for each row execute function private.household_invites_client_update_guard();

-- One of p_email / p_token: an email invite (onboarding, Settings → People) or
-- a single-use link (/join/[token], with p_expires_at). invited_by is always
-- the caller, as the old insert policy required.
create or replace function public.create_household_invite(
  p_household_id uuid,
  p_email text default null,
  p_token text default null,
  p_expires_at timestamptz default null
)
returns public.household_invites
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  _uid uuid := auth.uid();
  _row public.household_invites;
begin
  if _uid is null then
    raise exception 'You are not signed in.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.household_members m
    where m.household_id = p_household_id
      and m.user_id = _uid
  ) then
    raise exception 'You are not a member of that household.'
      using errcode = '42501';
  end if;

  if not private.household_has_paid_plan(p_household_id) then
    -- lib/gated-inserts.ts maps this message to UPGRADE_MESSAGE.invite.
    raise exception 'plan_required' using errcode = '42501';
  end if;

  if p_email is null and p_token is null then
    raise exception 'An invitation needs an email address or a link.'
      using errcode = '22023';
  end if;

  insert into public.household_invites
    (household_id, email, token, expires_at, invited_by, status)
  values
    (p_household_id, p_email, p_token, p_expires_at, _uid, 'pending')
  returning * into _row;

  return _row;
end;
$$;

revoke all on function public.create_household_invite(uuid, text, text, timestamptz) from public, anon;
grant execute on function public.create_household_invite(uuid, text, text, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- household_events
-- ---------------------------------------------------------------------------

revoke insert on public.household_events from anon, authenticated;
drop policy if exists household_events_insert on public.household_events;

-- Editing an existing date stays on the free plan (only adding is paid), but
-- not its household_id: moving a date in from another household is an insert
-- by another name.
revoke update on public.household_events from anon, authenticated;
grant update (title, event_date, event_type, person_id, school_id, notes)
  on public.household_events to authenticated;

create or replace function public.create_household_event(
  p_household_id uuid,
  p_title text,
  p_event_date date,
  p_event_type text default 'home',
  p_person_id uuid default null,
  p_school_id uuid default null,
  p_notes text default null
)
returns public.household_events
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  _uid uuid := auth.uid();
  _row public.household_events;
begin
  if _uid is null then
    raise exception 'You are not signed in.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.household_members m
    where m.household_id = p_household_id
      and m.user_id = _uid
  ) then
    raise exception 'You are not a member of that household.'
      using errcode = '42501';
  end if;

  if not private.household_has_paid_plan(p_household_id) then
    -- lib/gated-inserts.ts maps this message to UPGRADE_MESSAGE.familyDates.
    raise exception 'plan_required' using errcode = '42501';
  end if;

  -- SECURITY DEFINER skips RLS, so the foreign keys alone would let a date
  -- point at someone else's person or school. Same checks the action makes.
  if p_person_id is not null and not exists (
    select 1 from public.household_people p
    where p.id = p_person_id and p.household_id = p_household_id
  ) then
    raise exception 'That person isn’t in your household.'
      using errcode = '42501';
  end if;

  if p_school_id is not null and not exists (
    select 1 from public.schools s
    where s.id = p_school_id and s.household_id = p_household_id
  ) then
    raise exception 'That school isn’t in your household.'
      using errcode = '42501';
  end if;

  insert into public.household_events
    (household_id, title, event_date, event_type, person_id, school_id, notes)
  values
    (p_household_id, p_title, p_event_date, coalesce(p_event_type, 'home'),
     p_person_id, p_school_id, p_notes)
  returning * into _row;

  return _row;
end;
$$;

revoke all on function public.create_household_event(uuid, text, date, text, uuid, uuid, text) from public, anon;
grant execute on function public.create_household_event(uuid, text, date, text, uuid, uuid, text) to authenticated;
