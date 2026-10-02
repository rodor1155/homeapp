-- APPLIED to project fybpmpnfocaxhqiwiyhs on 2 Oct 2026 (Ross's go-ahead; Storage objects purged first).
--
-- W2a step 7 — remove server-side document storage, extraction webhook, email
-- reminders and Gmail import tables. Apply only after:
--   1. W2a steps 1–6 have been live for several days
--   2. Every object in the `documents` Storage bucket has been deleted via the
--      Storage API (dropping policies/tables alone orphans bytes)
--
-- Manual follow-up after apply (not in SQL):
--   • Delete Vault secrets extraction_webhook_url + extraction_webhook_secret
--   • Retire Vercel env: ANTHROPIC_API_KEY, EXTRACTION_WEBHOOK_SECRET,
--     RESEND_API_KEY, REMINDERS_FROM_EMAIL
--   • Re-run Supabase security advisor

-- ---------------------------------------------------------------------------
-- MUST come first: private.household_is_empty() (used by invite accept/join to
-- decide whether a joiner's own household can be dropped) queried documents,
-- reminders and gmail_connections. Redefine it without them BEFORE dropping
-- those tables, or invite acceptance would fail at runtime. Verified against the
-- live project: this and notify_extraction_webhook are the only functions that
-- reference the removed tables.
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- Extraction webhook (documents insert → POST /api/extraction)
-- ---------------------------------------------------------------------------

drop trigger if exists documents_extraction_webhook on public.documents;

drop function if exists private.notify_extraction_webhook();

-- ---------------------------------------------------------------------------
-- Reminder engine (document-only email reminders — removed in W2a-1)
-- ---------------------------------------------------------------------------

drop table if exists public.reminder_events cascade;
drop table if exists public.reminders cascade;
drop table if exists public.reminder_rules cascade;

-- ---------------------------------------------------------------------------
-- Gmail import
-- ---------------------------------------------------------------------------

drop table if exists public.gmail_import_candidates cascade;
drop table if exists public.gmail_connections cascade;

-- ---------------------------------------------------------------------------
-- Document extraction artefacts
-- ---------------------------------------------------------------------------

drop table if exists public.document_chunks cascade;

-- Renewal ↔ document link (renewals themselves stay until W2b)
-- The insert/update RLS policies on renewal_items referenced document_id, so
-- they are recreated without that clause before the column is dropped.
drop policy if exists renewal_items_insert on public.renewal_items;
drop policy if exists renewal_items_update on public.renewal_items;

create policy renewal_items_insert on public.renewal_items
  for insert to authenticated
  with check (
    private.is_household_member(household_id)
    and (
      person_id is null
      or exists (
        select 1 from public.household_people p
        where p.id = renewal_items.person_id
          and p.household_id = renewal_items.household_id
      )
    )
  );

create policy renewal_items_update on public.renewal_items
  for update to authenticated
  using (private.is_household_member(household_id))
  with check (
    private.is_household_member(household_id)
    and (
      person_id is null
      or exists (
        select 1 from public.household_people p
        where p.id = renewal_items.person_id
          and p.household_id = renewal_items.household_id
      )
    )
  );

alter table if exists public.renewal_items
  drop column if exists document_id;

-- ---------------------------------------------------------------------------
-- Documents table (after Storage purge)
-- ---------------------------------------------------------------------------

drop table if exists public.documents cascade;

-- ---------------------------------------------------------------------------
-- Storage bucket policies (NOT the bucket row — delete objects first, then
-- optionally remove the bucket itself in the dashboard or a later migration)
-- ---------------------------------------------------------------------------

drop policy if exists "documents_bucket_select" on storage.objects;
drop policy if exists "documents_bucket_insert" on storage.objects;
drop policy if exists "documents_bucket_update" on storage.objects;
drop policy if exists "documents_bucket_delete" on storage.objects;

-- The `documents` bucket row in storage.buckets is intentionally left until
-- objects are confirmed empty; then delete via Storage API / dashboard.
