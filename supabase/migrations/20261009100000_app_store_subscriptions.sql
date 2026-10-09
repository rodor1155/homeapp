-- App Store (StoreKit 2) subscriptions: one row per Apple subscription
-- (original transaction id), tied to the household it pays for.
--
-- Sits beside `subscriptions` (Stripe, web) rather than inside it: a household
-- could in principle hold both, and the two providers report different facts.
-- lib/billing.ts treats a household as paid when either is active.
--
-- Rows are written only by the service role — the App Store Server
-- Notifications endpoint and the signed-transaction endpoint, both of which
-- verify Apple's signature first — so there is no insert/update/delete policy,
-- the same shape as `subscriptions` in 20260909180000_subscriptions.sql.

create table if not exists public.app_store_subscriptions (
  -- Apple's stable id for the subscription across renewals.
  original_transaction_id text primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  product_id text not null,
  -- 'Production' or 'Sandbox' (TestFlight and App Review purchases are Sandbox).
  environment text not null check (environment in ('Production', 'Sandbox')),
  -- As of the last event: 'active', 'grace_period', 'billing_retry', 'expired'
  -- or 'revoked'. Informational — entitlement is computed from the dates below
  -- at read time, so a subscription lapses even if no notification arrives.
  status text not null default 'active',
  expires_at timestamptz,
  -- Apple's billing grace period, when one is running.
  grace_period_expires_at timestamptz,
  -- Set on refund or Family Sharing revocation; ends entitlement at once.
  revoked_at timestamptz,
  auto_renew boolean,
  last_transaction_id text,
  -- The household id the app passed to StoreKit at purchase, as Apple echoed it.
  app_account_token uuid,
  last_notification_type text,
  last_notification_subtype text,
  -- Apple's signedDate on the newest event applied; older events are ignored.
  last_event_at timestamptz,
  -- Who submitted it from the app. Kept null-safe so deleting that account
  -- does not take a shared household's subscription row with it.
  submitted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_store_subscriptions_household_id_idx
  on public.app_store_subscriptions(household_id);

alter table public.app_store_subscriptions enable row level security;

-- Members can read their household's plan; nobody can write it from the client.
create policy app_store_subscriptions_select on public.app_store_subscriptions
  for select to authenticated
  using (private.is_household_member(household_id));
