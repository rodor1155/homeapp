-- Shared shopping lists: a household keeps a few of them ("Weekly shop",
-- "DIY") and everyone ticks the same one off.
--
-- Members get full read/write on both tables, the same shape as
-- household_events in 20260911180000_household_people_schools_events.sql —
-- nothing in here is ever written by a worker.
--
-- This is a checklist, not a pantry: no quantities, no units, no stock. An
-- item is a line of text that is either still to get or already in the basket.

create table if not exists public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  -- When the list itself was last renamed or re-noted. Ticking an item does
  -- not touch it — that would be a write on every tap for no reader.
  updated_at timestamptz not null default now()
);
create index if not exists shopping_lists_household_id_idx
  on public.shopping_lists(household_id);

alter table public.shopping_lists enable row level security;

-- Stated rather than left to the schema's default privileges, so a member
-- can't end up with an empty list instead of an error.
grant select, insert, update, delete on public.shopping_lists to authenticated;

create policy shopping_lists_select on public.shopping_lists
  for select to authenticated
  using (private.is_household_member(household_id));
create policy shopping_lists_insert on public.shopping_lists
  for insert to authenticated
  with check (private.is_household_member(household_id));
create policy shopping_lists_update on public.shopping_lists
  for update to authenticated
  using (private.is_household_member(household_id))
  with check (private.is_household_member(household_id));
create policy shopping_lists_delete on public.shopping_lists
  for delete to authenticated
  using (private.is_household_member(household_id));

-- A line on a list. `household_id` is denormalised off the parent list so RLS
-- is one member check rather than a join on every read — the write policies
-- below are what keep the two in step.
create table if not exists public.shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.shopping_lists(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null,
  checked boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  -- Set when the box is ticked, cleared when it is un-ticked. Only ever read
  -- as "when did this land in the basket".
  checked_at timestamptz
);
-- The list screen's only query: one list, in the order it is written down.
create index if not exists shopping_list_items_list_order_idx
  on public.shopping_list_items(list_id, sort_order);
-- The counts on /lists and the home screen: what is still to get.
create index if not exists shopping_list_items_household_checked_idx
  on public.shopping_list_items(household_id, checked);

alter table public.shopping_list_items enable row level security;

grant select, insert, update, delete on public.shopping_list_items to authenticated;

create policy shopping_list_items_select on public.shopping_list_items
  for select to authenticated
  using (private.is_household_member(household_id));

-- Insert and update also check the parent list is in the same household, so a
-- member can't hang an item off another household's list by passing their own
-- household_id. The subquery runs as the caller, so it only ever sees lists
-- they can already read.
create policy shopping_list_items_insert on public.shopping_list_items
  for insert to authenticated
  with check (
    private.is_household_member(household_id)
    and exists (
      select 1
      from public.shopping_lists l
      where l.id = shopping_list_items.list_id
        and l.household_id = shopping_list_items.household_id
    )
  );
create policy shopping_list_items_update on public.shopping_list_items
  for update to authenticated
  using (private.is_household_member(household_id))
  with check (
    private.is_household_member(household_id)
    and exists (
      select 1
      from public.shopping_lists l
      where l.id = shopping_list_items.list_id
        and l.household_id = shopping_list_items.household_id
    )
  );
create policy shopping_list_items_delete on public.shopping_list_items
  for delete to authenticated
  using (private.is_household_member(household_id));
