-- Explicit Data API grants.
--
-- Supabase retires the auto-grant of SELECT/INSERT/UPDATE/DELETE to anon and
-- authenticated on newly-created public tables from 30 Oct 2026. Until now
-- every table in this project relied on that auto-grant for at least part of
-- its privileges (a handful — households, household_members, properties,
-- subscriptions, app_store_subscriptions — relied on it for *all* of their
-- privileges, no explicit GRANT was ever issued). Once the auto-grant is
-- gone, a fresh `supabase db reset` (or any brand-new project) 42501s on the
-- first query against these tables. This migration makes every grant
-- explicit so table access no longer depends on that retired behaviour.
--
-- Pattern per table:
--   1. REVOKE ALL from anon and authenticated first. This clears whatever
--      the old auto-grant left behind, including op combinations wider than
--      the table's own RLS policies allow (e.g. INSERT/UPDATE/DELETE on a
--      read-only inbound calendar cache) — the REVOKE+GRANT pair is
--      idempotent and lands on the same exact privilege set no matter what
--      a given environment's grant history looked like.
--   2. GRANT back only the ops the app and this table's RLS policies
--      actually use.
--   3. GRANT ALL to service_role. BYPASSRLS only skips row-level policy
--      checks — PostgREST still needs a real table-level GRANT for the
--      role it switches to, so service_role (the admin client in
--      lib/supabase-admin.ts) needs this explicitly too, same as any other
--      role.
-- RLS is left ENABLED everywhere (already the case for all 21 surviving
-- tables; restated here for safety) and no policy is touched.
--
-- No sequences: every table is gen_random_uuid()-keyed, there's nothing to
-- grant at the sequence level.
--
-- anon gets nothing on any table below. Every signed-out-reachable surface
-- (/join/[token], /kid/[token], /api/ics/[token]) reads through a
-- SECURITY DEFINER RPC (public.invite_link_preview, public.
-- accept_household_invite_link — these run as their owner, not the caller,
-- so they need no table grant for anon) or the service_role admin client
-- (lib/kid-view-load.ts, lib/ics-feed-load.ts) — never a direct anon-role
-- table query. Confirmed by grepping every `.from(...)` call site against
-- these tables in app/ and lib/.
--
-- Tables dropped by 20261002120000_remove_server_documents.sql (documents,
-- document_chunks, reminder_rules, reminders, reminder_events,
-- gmail_connections, gmail_import_candidates) and
-- 20261003100000_remove_server_renewals.sql (renewal_items) no longer exist
-- and are not referenced here.

-- households ------------------------------------------------------------
alter table public.households enable row level security;
revoke all on public.households from anon, authenticated;
-- insert happens only via handle_new_user() (SECURITY DEFINER trigger); no delete policy exists.
grant select, update on public.households to authenticated;
grant all on public.households to service_role;

-- household_members -------------------------------------------------------
alter table public.household_members enable row level security;
revoke all on public.household_members from anon, authenticated;
-- writes happen only via SECURITY DEFINER RPCs/triggers (accept_household_invite*, transfer_household_ownership).
grant select on public.household_members to authenticated;
grant all on public.household_members to service_role;

-- properties ----------------------------------------------------------------
alter table public.properties enable row level security;
revoke all on public.properties from anon, authenticated;
grant select, insert, update, delete on public.properties to authenticated;
grant all on public.properties to service_role;

-- household_invites -----------------------------------------------------------
alter table public.household_invites enable row level security;
revoke all on public.household_invites from anon, authenticated;
grant select, insert, update, delete on public.household_invites to authenticated;
grant all on public.household_invites to service_role;

-- schools ---------------------------------------------------------------------
alter table public.schools enable row level security;
revoke all on public.schools from anon, authenticated;
grant select, insert, update, delete on public.schools to authenticated;
grant all on public.schools to service_role;

-- household_people --------------------------------------------------------------
alter table public.household_people enable row level security;
revoke all on public.household_people from anon, authenticated;
grant select, insert, update, delete on public.household_people to authenticated;
grant all on public.household_people to service_role;

-- household_events ---------------------------------------------------------------
alter table public.household_events enable row level security;
revoke all on public.household_events from anon, authenticated;
grant select, insert, update, delete on public.household_events to authenticated;
grant all on public.household_events to service_role;

-- school_calendar_events (inbound ICS cache — read-only for the app; rebuilt by the service-role sync job)
alter table public.school_calendar_events enable row level security;
revoke all on public.school_calendar_events from anon, authenticated;
grant select on public.school_calendar_events to authenticated;
grant all on public.school_calendar_events to service_role;

-- household_calendars ---------------------------------------------------------------
alter table public.household_calendars enable row level security;
revoke all on public.household_calendars from anon, authenticated;
grant select, insert, update, delete on public.household_calendars to authenticated;
grant all on public.household_calendars to service_role;

-- household_calendar_events (inbound ICS cache — read-only for the app; rebuilt by the service-role sync job)
alter table public.household_calendar_events enable row level security;
revoke all on public.household_calendar_events from anon, authenticated;
grant select on public.household_calendar_events to authenticated;
grant all on public.household_calendar_events to service_role;

-- shopping_lists -----------------------------------------------------------------------
alter table public.shopping_lists enable row level security;
revoke all on public.shopping_lists from anon, authenticated;
grant select, insert, update, delete on public.shopping_lists to authenticated;
grant all on public.shopping_lists to service_role;

-- shopping_list_items ------------------------------------------------------------------
alter table public.shopping_list_items enable row level security;
revoke all on public.shopping_list_items from anon, authenticated;
grant select, insert, update, delete on public.shopping_list_items to authenticated;
grant all on public.shopping_list_items to service_role;

-- person_timetable_slots ----------------------------------------------------------------
alter table public.person_timetable_slots enable row level security;
revoke all on public.person_timetable_slots from anon, authenticated;
grant select, insert, update, delete on public.person_timetable_slots to authenticated;
grant all on public.person_timetable_slots to service_role;

-- household_routines ---------------------------------------------------------------------
alter table public.household_routines enable row level security;
revoke all on public.household_routines from anon, authenticated;
grant select, insert, update, delete on public.household_routines to authenticated;
grant all on public.household_routines to service_role;

-- household_meal_plans -------------------------------------------------------------------
alter table public.household_meal_plans enable row level security;
revoke all on public.household_meal_plans from anon, authenticated;
grant select, insert, update, delete on public.household_meal_plans to authenticated;
grant all on public.household_meal_plans to service_role;

-- person_day_status ------------------------------------------------------------------------
alter table public.person_day_status enable row level security;
revoke all on public.person_day_status from anon, authenticated;
grant select, insert, update, delete on public.person_day_status to authenticated;
grant all on public.person_day_status to service_role;

-- subscriptions (written only by the service role — Stripe webhook / lib/billing.ts)
alter table public.subscriptions enable row level security;
revoke all on public.subscriptions from anon, authenticated;
grant select on public.subscriptions to authenticated;
grant all on public.subscriptions to service_role;

-- household_calendar_feeds -------------------------------------------------------------------
alter table public.household_calendar_feeds enable row level security;
revoke all on public.household_calendar_feeds from anon, authenticated;
grant select, insert, update, delete on public.household_calendar_feeds to authenticated;
grant all on public.household_calendar_feeds to service_role;

-- person_kid_links ----------------------------------------------------------------------------
alter table public.person_kid_links enable row level security;
revoke all on public.person_kid_links from anon, authenticated;
grant select, insert, update, delete on public.person_kid_links to authenticated;
grant all on public.person_kid_links to service_role;

-- app_store_subscriptions (written only by the service role — app/api/appstore/notifications, lib/appstore/)
alter table public.app_store_subscriptions enable row level security;
revoke all on public.app_store_subscriptions from anon, authenticated;
grant select on public.app_store_subscriptions to authenticated;
grant all on public.app_store_subscriptions to service_role;

-- apple_sign_in_tokens (service_role only by design — zero authenticated/anon policies exist)
alter table public.apple_sign_in_tokens enable row level security;
revoke all on public.apple_sign_in_tokens from anon, authenticated;
grant all on public.apple_sign_in_tokens to service_role;
