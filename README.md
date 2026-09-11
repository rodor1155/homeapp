# homeapp

Next.js (App Router) + TypeScript + Tailwind CSS + Supabase. See [CLAUDE.md](./CLAUDE.md) for the plan.

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in the Supabase values
npm run dev
```

Open http://localhost:3000.

## Environment variables

| Variable | Exposure | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | public | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | server-only secret | admin client (`lib/supabase-admin.ts`); bypasses RLS |
| `NEXT_PUBLIC_SITE_URL` | public | base URL for auth redirect links (magic link, OAuth, email confirm) |
| `ANTHROPIC_API_KEY` | server-only secret | Claude vision extraction |
| `EXTRACTION_WEBHOOK_SECRET` | server-only secret | shared secret for `/api/extraction`; must match the Supabase Vault secret `extraction_webhook_secret` |
| `INTERNAL_TOOLS_EMAILS` | server-only | optional CSV allow-list for `/internal/*` pages |
| `RESEND_API_KEY` | server-only secret | Resend key for reminder email; unset = reminders are logged as skipped, not sent |
| `REMINDERS_FROM_EMAIL` | server-only | From: address for reminder email, on a domain verified in Resend |
| `CRON_SECRET` | server-only secret | bearer token for `/api/cron/reminders` and `/api/cron/school-calendars`; Vercel sends it automatically once set |
| `STRIPE_SECRET_KEY` | server-only secret | Stripe key; **unset = billing off**, every household keeps the paid entitlements |
| `STRIPE_WEBHOOK_SECRET` | server-only secret | signing secret for `/api/stripe/webhook`; unset = the webhook no-ops |
| `STRIPE_PRICE_GBP_MONTHLY` | server-only | price ID offered to UK households, £4.99/mo |
| `STRIPE_PRICE_GBP_YEARLY` | server-only | price ID offered to UK households, £39/yr |
| `STRIPE_PRICE_USD_MONTHLY` | server-only | price ID offered to US households, $6.99/mo |
| `STRIPE_PRICE_USD_YEARLY` | server-only | price ID offered to US households, $59/yr |

Set the secrets in the Vercel project settings (Production + Preview).
`NEXT_PUBLIC_SITE_URL` must match the deployment origin (`https://homeapp-mu.vercel.app`).

## Database

Migrations live in [`supabase/migrations/`](./supabase/migrations) and are already applied
to the linked project. Tables: `households`, `household_members`, `properties`,
`household_invites`, `documents`, `document_chunks`, `reminder_rules`, `reminders`,
`reminder_events`, `subscriptions`; plus a private `documents` Storage bucket. Every
table has row-level security scoped to household membership. The `subscriptions`
migration is the exception: written, not yet applied.

## Document extraction

A new `documents` row (`extraction_status = 'pending'`) fires a Supabase database
webhook → `POST /api/extraction` → Claude (`claude-sonnet-4-6`) vision extraction →
fields + confidence written back, full text chunked into `document_chunks`. Review and
confirm extracted fields on `/documents`. `/internal/extraction-test` is a benchmark
harness (not linked from any nav).

## Renewal reminders

Every extracted or confirmed document with a future renewal (or, failing that, end)
date gets a `reminders` row, written server-side by `syncRemindersForDocument()` in
[`lib/reminders.ts`](./lib/reminders.ts) whenever extraction finishes or a review is
confirmed. How far ahead to nudge comes from `reminder_rules`, keyed on the category
from `lib/home-overview.ts` and the household's locale — 60/30/7/0 days by default.

`GET /api/cron/reminders` runs daily at 08:00 UTC (see [`vercel.json`](./vercel.json)),
emails every household member whose reminder falls due that day via Resend, and logs
each send in `reminder_events` — the unique `(reminder_id, offset_days)` there is what
stops a nudge going out twice. The day-of send closes the reminder off as `sent`.

`GET /api/cron/school-calendars` runs daily at 06:15 UTC on the same `CRON_SECRET`,
re-reading every school's linked ICS feed through `syncSchoolCalendar()` so term dates
on the dashboard stay fresh. It takes at most 50 schools a run, stalest first, and one
unreadable feed is recorded against that school rather than failing the run.

## Billing

Free households keep unlimited documents but get three live reminders, no export
and (later) no AI answers. Paying lifts all of that: £4.99/mo or £39/yr in the UK,
$6.99/mo or $59/yr in the US, cancelled in one click from Stripe's billing portal.

Billing is off until `STRIPE_SECRET_KEY` is set, and off means **inert** —
[`lib/billing.ts`](./lib/billing.ts) hands back the paid entitlements, so the gates
change nothing for anyone until the keys are in place. With the key set, plans come
off the `subscriptions` table: `POST /api/stripe/checkout` starts a Checkout Session
(household id in the metadata), `POST /api/stripe/portal` opens the portal, and
`POST /api/stripe/webhook` verifies Stripe's signature against the raw body and
writes the row on the service role. `/settings` shows the plan and the buttons.

The `subscriptions` migration is written but **not yet applied** to the project.

## Supabase config that isn't in code

- **Auth → URL Configuration**: add `${NEXT_PUBLIC_SITE_URL}/auth/callback` (local and
  prod) to the redirect allow-list; set the Site URL to the prod origin.
- **Auth → Providers → Google**: paste a Google OAuth client ID/secret and add
  `${SUPABASE_URL}/auth/v1/callback` as an authorized redirect URI in Google Cloud.
  Until then the "Continue with Google" button returns an error; email + magic link work.
- The built-in email sender is rate-limited; add custom SMTP before real traffic.
- **Vault secrets** `extraction_webhook_url` and `extraction_webhook_secret` are set on
  the project (URL → `https://homeapp-mu.vercel.app/api/extraction`). The secret must
  match Vercel's `EXTRACTION_WEBHOOK_SECRET`.

## Deploy

Vercel builds from `main`.
