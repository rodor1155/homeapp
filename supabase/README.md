# Supabase migrations — conventions

Migrations in `migrations/` are applied, in filename order, to the linked
project. See the root `CLAUDE.md` for the full schema/table inventory; this
file is just the house rules for writing a new migration.

## Every migration that creates a public table must be RLS-safe and grant-explicit

Supabase auto-grants Data API (PostgREST) privileges to `anon` and
`authenticated` on newly-created public tables — but that auto-grant is
retired from 30 Oct 2026. A migration that only does `create table` +
`create policy` and relies on the auto-grant will work today and 42501
("permission denied for table ...") on the next `supabase db reset` or
fresh project after that date. So every migration that creates a public
table must, in the same migration:

1. `alter table ... enable row level security` — never ship an RLS-off table.
2. Explicit `grant <ops> on <table> to authenticated` (and `to anon` only if
   a genuinely signed-out route reads it directly — most signed-out routes
   in this app go through a `SECURITY DEFINER` RPC instead, which needs no
   table grant for the caller's role at all).
3. `grant all on <table> to service_role` — `BYPASSRLS` only skips RLS
   policy checks, PostgREST still needs a real table grant for whichever
   role it switches to.
4. Grant only the operations the table's own RLS policies and the app
   code actually use — least privilege, not a reflex `grant all`.

```sql
create table if not exists public.widgets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade
);
alter table public.widgets enable row level security;
create policy widgets_select on public.widgets
  for select to authenticated using (public.is_household_member(household_id));
grant select, insert, update, delete on public.widgets to authenticated;
grant all on public.widgets to service_role;
```

`20261020120000_explicit_data_api_grants.sql` is a worked example across
every table that existed before this convention was written down — read it
for the reasoning behind the REVOKE-then-GRANT pattern it uses to normalise
tables whose grants had drifted from their RLS policies.
