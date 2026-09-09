-- Billing: one row per household holding whatever Stripe last told us. The
-- household is the customer, not the user, so the primary key is the household
-- id and every member sees the same plan.
--
-- Rows are written only by the service role (the Stripe webhook and the
-- checkout route), so there is no insert/update/delete policy — same shape as
-- reminders in 20260909160000_reminders.sql.

create table if not exists public.subscriptions (
  household_id uuid primary key references public.households(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text,
  -- Stripe's subscription status, plus 'none' for a household that has never
  -- been through checkout. Deliberately unconstrained: a status we don't know
  -- about should land in the row rather than fail the webhook, and anything
  -- outside ('active','trialing') is treated as free by lib/billing.ts.
  status text not null default 'none',
  -- Which price they are on: 'gbp_monthly', 'usd_yearly', and so on.
  plan text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz default now()
);

-- The webhook arrives knowing the Stripe customer, not the household.
create index if not exists subscriptions_stripe_customer_id_idx
  on public.subscriptions(stripe_customer_id);

alter table public.subscriptions enable row level security;

-- Members can read their household's plan; nobody can write it from the client.
create policy subscriptions_select on public.subscriptions
  for select to authenticated
  using (private.is_household_member(household_id));
