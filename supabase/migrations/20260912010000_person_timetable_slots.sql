-- Per-child school timetable slots. A week of lessons someone typed in or
-- confirmed from a scan. Members get full read/write, same shape as
-- household_events / shopping_lists — nothing here is written by a worker.

create table if not exists public.person_timetable_slots (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  person_id uuid not null references public.household_people(id) on delete cascade,
  -- 0 = Monday … 6 = Sunday (ISO weekday - 1). School weeks are Mon–Fri;
  -- weekend rows are allowed for clubs.
  weekday smallint not null check (weekday >= 0 and weekday <= 6),
  -- Optional wall-clock times as HH:MM (24h). Null when the school only
  -- prints a period label ("P3", "Period 4").
  start_time text,
  end_time text,
  period_label text,
  subject text not null,
  location text,
  bring_kit boolean not null default false,
  kit_label text,
  bring_ingredients boolean not null default false,
  ingredients_note text,
  notes text,
  -- Optional link back to a scanned source in documents.
  source_document_id uuid references public.documents(id) on delete set null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint person_timetable_slots_start_time_fmt
    check (start_time is null or start_time ~ '^\d{2}:\d{2}$'),
  constraint person_timetable_slots_end_time_fmt
    check (end_time is null or end_time ~ '^\d{2}:\d{2}$')
);

create index if not exists person_timetable_slots_household_person_idx
  on public.person_timetable_slots(household_id, person_id, weekday, sort_order);

create index if not exists person_timetable_slots_person_weekday_idx
  on public.person_timetable_slots(person_id, weekday);

alter table public.person_timetable_slots enable row level security;

grant select, insert, update, delete on public.person_timetable_slots to authenticated;

create policy person_timetable_slots_select on public.person_timetable_slots
  for select to authenticated
  using (private.is_household_member(household_id));

-- Insert/update also require the person to belong to the same household, so a
-- member can't hang a slot off another household's child by passing their own
-- household_id.
create policy person_timetable_slots_insert on public.person_timetable_slots
  for insert to authenticated
  with check (
    private.is_household_member(household_id)
    and exists (
      select 1
      from public.household_people p
      where p.id = person_timetable_slots.person_id
        and p.household_id = person_timetable_slots.household_id
    )
  );

create policy person_timetable_slots_update on public.person_timetable_slots
  for update to authenticated
  using (private.is_household_member(household_id))
  with check (
    private.is_household_member(household_id)
    and exists (
      select 1
      from public.household_people p
      where p.id = person_timetable_slots.person_id
        and p.household_id = person_timetable_slots.household_id
    )
  );

create policy person_timetable_slots_delete on public.person_timetable_slots
  for delete to authenticated
  using (private.is_household_member(household_id));
