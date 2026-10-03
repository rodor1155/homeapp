-- APPLIED to project fybpmpnfocaxhqiwiyhs on 3 Oct 2026 (applied by Ross via Grok Bot after the web deploy; verified: renewal_items gone, household_is_empty ok, no new advisor warnings).
--
-- W2b — remove server-side renewal_items. Apply only after the W2b web deploy
-- (no code reads renewal_items) is live.

-- ---------------------------------------------------------------------------
-- MUST come first: private.household_is_empty() (invite accept/join) still
-- queries renewal_items. Redefine without that clause BEFORE dropping the table.
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

drop table if exists public.renewal_items cascade;
