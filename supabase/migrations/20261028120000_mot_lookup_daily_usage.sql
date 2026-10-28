-- Durable daily cap for the DVSA MOT lookup (POST /api/vehicle/mot).
--
-- The route's in-process burst throttle (lib/rate-limit.ts) resets whenever
-- Vercel starts a new isolate, so on its own it can't hold a daily budget.
-- This table keeps one counter per (UTC day, subject): a row per user id, and
-- one row with subject '*' for the whole app. public.consume_mot_lookup()
-- checks both limits and increments both counters in one statement-level
-- atomic step, so concurrent lookups can't race past the cap.
--
-- Access: nobody but service_role touches any of this. The route calls the
-- function through the admin client (lib/supabase-admin.ts) with the user id
-- it has already verified from the session — authenticated is deliberately
-- NOT granted execute, because the limits are arguments and a client calling
-- the RPC directly could pass its own (or burn the global budget for
-- everyone). Same explicit-grant pattern as
-- 20261020120000_explicit_data_api_grants.sql: RLS on, no policies, REVOKE
-- from anon/authenticated, GRANT to service_role.

create table if not exists public.mot_lookup_daily_usage (
  usage_day date not null,
  -- auth.users id as text, or '*' for the app-wide counter. Text rather than a
  -- uuid FK so the global row fits the same key and account deletion never
  -- has to wait on (or cascade into) a usage counter.
  subject text not null,
  lookup_count integer not null default 0 check (lookup_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (usage_day, subject)
);

comment on table public.mot_lookup_daily_usage is
  'Per-user and global (subject = ''*'') daily DVSA MOT lookup counters. service_role only; written by public.consume_mot_lookup().';

alter table public.mot_lookup_daily_usage enable row level security;
revoke all on public.mot_lookup_daily_usage from anon, authenticated;
grant all on public.mot_lookup_daily_usage to service_role;

-- Returns 'ok' (and counts the lookup), or 'user_limit' / 'global_limit'
-- (and counts nothing). A refused lookup is never counted, so a user who is
-- over their own cap can't eat into the global budget by retrying.
create or replace function public.consume_mot_lookup(
  p_user_id uuid,
  p_user_limit integer,
  p_global_limit integer
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date := (now() at time zone 'utc')::date;
  v_subject text := p_user_id::text;
  v_global integer;
  v_user integer;
begin
  if p_user_id is null or p_user_limit is null or p_global_limit is null
     or p_user_limit < 1 or p_global_limit < 1 then
    raise exception 'consume_mot_lookup: bad arguments';
  end if;

  -- Lock order is always global row, then user row, so two concurrent calls
  -- can't deadlock. Upsert-with-zero makes sure both rows exist to lock.
  insert into public.mot_lookup_daily_usage (usage_day, subject, lookup_count)
  values (v_day, '*', 0), (v_day, v_subject, 0)
  on conflict (usage_day, subject) do nothing;

  select lookup_count into v_global
  from public.mot_lookup_daily_usage
  where usage_day = v_day and subject = '*'
  for update;

  select lookup_count into v_user
  from public.mot_lookup_daily_usage
  where usage_day = v_day and subject = v_subject
  for update;

  if v_user >= p_user_limit then
    return 'user_limit';
  end if;
  if v_global >= p_global_limit then
    return 'global_limit';
  end if;

  update public.mot_lookup_daily_usage
  set lookup_count = lookup_count + 1, updated_at = now()
  where usage_day = v_day and subject in ('*', v_subject);

  -- Keep the table small: a month of history is plenty for "how close are we
  -- running to the DVSA quota". usage_day leads the primary key, so this is
  -- an index range scan.
  delete from public.mot_lookup_daily_usage
  where usage_day < v_day - 31;

  return 'ok';
end;
$$;

revoke all on function public.consume_mot_lookup(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_mot_lookup(uuid, integer, integer) to service_role;
