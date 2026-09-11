@AGENTS.md

# homeapp

A Next.js + Supabase app. This file records the plan and conventions so any
agent (or human) picking up the repo has the same context.

## Plan

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Next.js App Router + TypeScript + Tailwind scaffold; three Supabase client helpers. | done |
| 2 | Auth (email/password, magic link, Google OAuth), household onboarding, document upload to Storage. | done |
| 3 | Document extraction worker — DB webhook → Claude vision → fields + confidence + chunked text; review/confirm UI; internal test harness. | done |
| 1b | Embeddings for `document_chunks` + retrieval. | next |
| 3b | Mistral OCR fallback for `needs_review` long / poor-quality scans (after the 20-doc benchmark). | not started |
| 3c | Household invite-accept flow (`/invite` + three SECURITY DEFINER RPCs). | done — migrations applied |
| 4 | Reminder engine — dates → `reminders` rows → daily cron → Resend email. | done — migrations applied; Resend + `CRON_SECRET` not set on Vercel yet |
| 5 | Settings — household/property/locale editing, people + invites, sign out, account deletion (App Store requirement). | done — migrations applied |
| 6 | Billing — Stripe subscriptions, checkout + portal + webhook, export gate, plan card. | done — **`subscriptions` migration not yet applied**; `STRIPE_SECRET_KEY` is set on Vercel prod so export gate is live |
| later | The real dashboard. | not started |

Do not build the next phase's work until this table says so. Reminders, the
dashboard proper, and RAG are explicitly out until then.

## Design system — "the household ledger"

One visual system, defined once, used by every screen. **Build new screens
(dashboard proper, reminders, settings) on this — don't reinvent it.**

- **Tokens live in `app/globals.css`** — a `@theme` block (Tailwind v4 native, so
  `bg-paper` / `text-ink` / `text-lg` / `rounded` etc. are generated) plus a
  `@media (prefers-color-scheme: dark)` `:root` override of the same custom
  properties. Never hard-code a colour or a one-off font size in a component.
  - Palette (6 hues + tints): `paper` (warm grey-green ground), `ink`
    (blue-black text/marks), `rule` (hairlines), `ochre` (the binding line,
    focus, links-on-hover, "needs a look"), `sage` ("filed"), `oxblood`
    ("couldn't read it"). Plus `paper-raised` / `paper-sunk`, `ink-soft` /
    `ink-faint`, `*-tint`.
  - Type: **Fraunces** (display / headings / wordmark) + **IBM Plex Sans**
    (body, with `.tnum` tabular figures for dates, amounts, counts), loaded in
    `app/layout.tsx` as `--font-fraunces` / `--font-plex`. Scale: `--text-xs`…
    `--text-3xl` in `@theme`.
  - Geometry: `--radius` 4px (8px for the auth sheet). **No drop shadows** —
    depth comes from paper tones + hairlines.
- **Motif classes** (also in `globals.css` `@layer components`): `.ledger-bound`
  (ochre margin rule down the content column — on every screen), `.sheet` (the
  auth "bound leaf"), `.ruled-row` (section heading on a ruled baseline with an
  ochre column tick — used via `<SectionHeading>`), `.field-input`, `.btn` /
  `.btn-quiet` / `.btn-danger` (oxblood — irreversible actions only) /
  `.text-action`, `.pill` + `.pill-high|medium|low` (confidence
  markers), `.entry` + `.entry--filed|review|fault` (register-row left status
  edge), `.mark-filed|review|fault|muted`, `.margin-note` (extraction ambiguity).
- **Primitives in `components/ui.tsx`** (presentational, no `"use client"`, safe
  in server or client components): `LedgerPage`, `Wordmark`, `SectionHeading`,
  `Card`, `Button` (`solid|quiet|ghost|danger`), `Field`, `ConfidencePill`,
  `StatusMark` + `STATUS_META` /
  `statusEdgeClass` (map an `extraction_status` to a plain-spoken label + tone).
- **Tone**: plain-spoken and domestic, never SaaS. Status is shown as words in a
  restrained colour ("Filed", "Needs a look", "Ready to check", "Couldn't read
  it"), not badges. Confidence pills are the one place colour is deliberately
  front-and-centre — keep them calm.
- `/internal/extraction-test` is deliberately left unstyled beyond the base
  font/colour — do not dress it up.

## Stack

- Next.js 16 (App Router, Turbopack) + React 19
- TypeScript (strict), import alias `@/*` -> repo root
- Tailwind CSS v4 (`@tailwindcss/postcss`, `@import "tailwindcss"` in
  `app/globals.css`, with `tailwind.config.js` referenced via `@config`)
- ESLint flat config via `eslint-config-next`
- Supabase: `@supabase/ssr` (cookie-based sessions) + `@supabase/supabase-js`

## Structure

```
proxy.ts        Session refresh + auth gate. Next 16 renamed Middleware -> Proxy;
                the file is proxy.ts, the export is `proxy`. Do NOT add middleware.ts.
app/
  page.tsx              routes to /sign-in, /invite, /onboarding, or /dashboard
  sign-in/, sign-up/    AuthPanel (client) — password + magic link + Google
  auth/callback/        PKCE code exchange (magic link, OAuth, email confirm)
  auth/sign-out/        POST route handler
  onboarding/           3-step wizard (locale -> property -> partner invite)
  dashboard/            placeholder, gated on completed onboarding
  documents/            list + uploader + per-doc extraction review/confirm (DocumentsList)
  invite/               pending invites, accept/decline (InviteList); works signed out
  settings/             household + property + locale (HouseholdForm), plan (PlanPanel),
                        people and sent invites (PeoplePanel), sign out, account
                        deletion (DeleteAccountPanel)
  internal/extraction-test/   benchmark harness — NOT linked from any nav
  api/extraction/       POST route the Supabase DB webhook calls (nodejs, maxDuration 60)
  api/stripe/           checkout/ + portal/ + webhook/ POST routes (nodejs)
  actions/              auth.ts, onboarding.ts, documents.ts, invites.ts, extraction-test.ts,
                        settings.ts, account.ts
components/      ui.tsx (design primitives), AuthPanel.tsx, SignOutButton.tsx,
                 AppShell.tsx (top bar: sign out + gear to /settings), BottomTabBar.tsx
lib/
  supabase-client.ts   browser client (createBrowserClient)
  supabase-server.ts   server client with cookie bridge (server-only)
  supabase-admin.ts    service-role client (server-only, bypasses RLS)
  supabase.ts          deprecated re-export of supabase-client
  household.ts         server-only: loadHouseholdContext / isOnboarded / requireOnboarded
  extraction.ts        server-only: extractDocument() (pure Claude call) +
                       runExtractionForDocument() (download → extract → persist) + chunkText()
  document-types.ts    client-safe row/confidence shapes + REVIEW_FIELDS + DOCUMENTS_SELECT
  invites.ts           PendingInvite + loadPendingInvites(client) — wraps the RPC,
                       returns [] on any error so a page never fails over invites;
                       plus SentInvite + loadSentInvites(client, householdId)
  members.ts           HouseholdMember + loadHouseholdMembers(client, householdId) —
                       membership rows off the table, emails off the SECURITY DEFINER
                       function; emails come back null if that call fails
  billing.ts           server-only: isBillingConfigured / getEntitlements /
                       createStripeClient / priceIdFor + the `subscriptions` read+write
                       helpers. Unconfigured = paid entitlements, so gates are inert
  property.ts          PROPERTY_TYPES — the picklist onboarding and settings share
  safe-path.ts         safeNextPath() — clamps a `?next=` value to a same-site path
supabase/migrations/   applied to the linked project (ref fybpmpnfocaxhqiwiyhs)
```

## Database (all in `supabase/migrations/`)

- `households(id, name, locale check UK|US, created_at)`
- `household_members(household_id, user_id, role, pk(household_id,user_id))` — members can
  read the rows, but `auth.users` is not exposed, so the settings "People" list gets
  addresses from `public.household_member_emails(uuid)` — SECURITY DEFINER, guarded on
  `private.is_household_member`, `authenticated` only. This is the only privilege phase 5
  adds. `20260909171500_household_member_emails.sql` is **written but not applied**; until
  it is, the list still renders with the emails blank.
- `properties(id, household_id, address, type, year_built, created_at)`
- `household_invites(id, household_id, email, invited_by, status, created_at)` — created
  during onboarding from the partner email. Members-only select, so the invitee reaches
  their own row through `public.pending_invites_for_me()` /
  `accept_household_invite(uuid)` / `decline_household_invite(uuid)` — SECURITY DEFINER,
  `authenticated` only. Accepting also inserts the `household_members` row (no insert
  policy exists) and, if the caller never used the household they were given at signup
  (no property, no documents, sole member), drops that membership so they still hold
  exactly one household — every other query assumes the oldest membership is the right
  one. `/onboarding` redirects to `/invite` when pending invites exist (same as `/`).
- `documents(...)` — upload lands `extraction_status = 'pending'`; the worker fills
  `doc_type / provider / reference / start_date / end_date / renewal_date / amount /
  currency / key_contact_name / key_contact_phone` and the `extraction_confidence`
  jsonb (`{ model, page_count, overall_confidence, flags, error, fields: {k: {value, confidence, ambiguity}} }`).
  Status flow: `pending → processing → extracted | needs_review | failed → confirmed`.
- `document_chunks(id, document_id, chunk_index, content)` — ~500-token (≈2000-char)
  plain-text chunks. Select-only RLS via the parent document; writes are service-role.
  No embeddings yet (phase 1b).
- `reminder_rules(category, locale, offsets int[], pk(category, locale))` — reference
  data: how many days before a due date to nudge. `category` mirrors `CATEGORIES` in
  `lib/home-overview.ts`, plus a `default` row. Readable by any signed-in user
  (RLS on, `using (true)`); written only by migrations.
- `reminders(id, household_id, document_id, kind check renewal|end, due_date, offsets int[],
  status check scheduled|sent|cancelled, created_at, unique(document_id, kind))` —
  members can select/update/delete; **no insert policy**, rows come from
  `syncRemindersForDocument()` on the service role. Indexed on `(status, due_date)`.
- `reminder_events(id, reminder_id, offset_days, channel, result, sent_at,
  unique(reminder_id, offset_days))` — the send log, and the thing that stops a
  duplicate nudge. Select-only via the parent reminder; writes are service-role.
- `subscriptions(household_id pk → households, stripe_customer_id, stripe_subscription_id,
  status default 'none', plan, current_period_end, cancel_at_period_end, updated_at)` —
  one row per household (the household is the Stripe customer, so everyone in it shares
  the plan). Members-only select; **no insert/update/delete policy**, rows are written by
  the Stripe webhook and the checkout route on the service role. Indexed on
  `stripe_customer_id`, which is how a webhook event finds the household. `status` is
  deliberately unconstrained — an unknown Stripe status should land in the row rather
  than fail the webhook. `20260909180000_subscriptions.sql` is **written but not applied**.
- Private Storage bucket `documents`, key pattern `<household_id>/<document_id>/<filename>`

RLS model: every table (and the bucket) is gated on
`private.is_household_member(household_id)` — a `SECURITY DEFINER` helper in the
non-exposed `private` schema. New rows are reachable because
`public.handle_new_user()` (trigger on `auth.users`) drops every new signup into
their own household as `owner`. `public.prune_empty_household()` (trigger on
`household_members` delete) removes a household once it has no members, cascading
to properties/documents/chunks/invites. Orphaned **Storage objects** are not yet
cleaned up — a known gap for a later lifecycle job.

## Extraction worker (phase 3)

- **Trigger**: `documents_extraction_webhook` (after insert on `public.documents`)
  → `private.notify_extraction_webhook()` → `net.http_post` to the URL in Vault
  secret `extraction_webhook_url`, with `x-webhook-secret` from Vault secret
  `extraction_webhook_secret`. Fires only for `extraction_status = 'pending'`;
  no-ops (warning only) if the Vault secrets are unset. This is the "database
  webhook" — no polling.
- **Route** `POST /api/extraction`: constant-time-compares `x-webhook-secret`
  against `EXTRACTION_WEBHOOK_SECRET`, then `runExtractionForDocument(record.id)`.
  Also accepts `{ document_id }` for manual re-runs.
- **`extractDocument()`**: `claude-sonnet-4-6` vision, forced `record_extraction`
  tool call (schema = the 10 fields, each `{value, confidence, ambiguity}`, plus
  `full_text`). PDFs > 8 pages or files > 20 MB are parked as `needs_review`
  without calling Claude (OCR fallback = phase 3b). Any non-`high` field, an
  all-low result, or missing text → `needs_review`; unsupported type / API error
  / download failure → `failed`; otherwise `extracted`.
- **Review UI**: `/documents` shows every `extracted / needs_review / confirmed`
  doc as an editable form with per-field confidence pills and ambiguity notes;
  "Confirm" writes edits back and sets `confirmed`. `failed` / `needs_review`
  docs get a "Re-run extraction" button (`reprocessDocument` action).
- **`/internal/extraction-test`**: upload a file, see the raw outcome + confidence
  + transcription. No Storage/DB. Gated to `INTERNAL_TOOLS_EMAILS` (or any
  signed-in user if unset). Not linked from anywhere.

## Reminder engine (phase 4)

- **`lib/reminders.ts`** (server-only, admin client): `pickReminderDates()` picks the
  renewal date, else the end date, and only if it is still ahead — so most documents
  get nothing. `offsetsFor()` reads `reminder_rules`, falling back to the `default`
  row then to `FALLBACK_OFFSETS`. `syncRemindersForDocument()` is idempotent: an
  unchanged due date is left alone, a moved one deletes and re-inserts (so old events
  don't suppress the new nudges), a vanished one cancels.
- **Wired in** at the end of `runExtractionForDocument()` (covers the webhook *and*
  `reprocessDocument`) and `confirmExtraction()`. Both best-effort — a reminder is
  never allowed to fail the user's action.
- **`lib/email.ts`**: Resend wrapper. No `RESEND_API_KEY` / `REMINDERS_FROM_EMAIL`
  → warn and return `{ skipped: true }`; nothing in it throws.
- **`GET /api/cron/reminders`** (nodejs, maxDuration 60): when `CRON_SECRET` is unset,
  logs a warning and returns 200 `{ skipped: true }` so Vercel's daily schedule does
  not error; bearer-token compare against `CRON_SECRET` when set, then for each
  scheduled reminder with `due_date >= today`, fires the
  offsets landing on today that have no `reminder_events` row yet, emails every
  household member (resolved through `auth.admin.getUserById`), logs the result, and
  marks the reminder `sent` once the 0-offset has gone. One bad reminder is caught and
  counted, not fatal. Returns `{ processed, sent, skipped, errors }`.
- **`vercel.json`** runs it at `0 8 * * *`. Vercel supplies the `Authorization: Bearer`
  header itself once `CRON_SECRET` is set on the project.

## Settings + account deletion (phase 5)

- **`/settings`** (inside `AppShell`, `requireOnboarded`, reached from the gear in the top
  bar — deliberately *not* a bottom tab). Five cards: "Your household", "Plan" (phase 6),
  "People", "Sign out", "Delete account".
- **`app/actions/settings.ts`** — all on the cookie client, so RLS decides the scope;
  each action resolves the caller's oldest membership the same way the rest of the app
  does. `updateHousehold()` repeats onboarding's validation shape (name, `UK|US`,
  address, 1000–2100 year) and writes `households` + `properties`. `inviteMember()`
  inserts a `household_invites` row with `invited_by = caller` — the same rule
  onboarding uses — after rejecting the caller's own address, an existing member and a
  duplicate pending invite. `revokeInvite()` updates `status` to `'revoked'`, which the
  existing member update policy already allows.
- **`app/actions/account.ts`** — `deleteAccount(confirmText)` refuses anything but
  `DELETE`, then on the **admin client**: find the households where the caller is the
  only member, delete every Storage object under each `<household_id>/` prefix, and
  `auth.admin.deleteUser()`. The FK cascades plus `prune_empty_household()` clear
  `household_members`, `households`, `properties`, `documents`, `document_chunks`,
  invites and reminders — no migration needed for any of it. Storage has no cascade,
  which is why it is done by hand, and the whole cleanup is wrapped: a failure there is
  logged and the deletion still goes through. Finally `signOut()` and `redirect("/")`.
- Households the caller **shares** with someone else are never touched.

## Billing (phase 6)

Freemium. **Free**: unlimited documents, 3 active reminders, no export, no AI Q&A.
**Paid**: unlimited reminders, export, household sharing, and (later) AI Q&A + cover
analysis. £4.99/mo or £39/yr for UK households, $6.99/mo or $59/yr for US ones.
Cancellation is one click in Stripe's own billing portal — never behind our UI.

- **Off by default, and off means inert.** `isBillingConfigured()` is true only when
  `STRIPE_SECRET_KEY` is set. While it is false, `getEntitlements()` returns the *paid*
  set without touching Stripe or the database, so every gate is a no-op and the app
  behaves exactly as it did before phase 6. Once it is true, a household is paid only on
  a `subscriptions.status` of `active` or `trialing`; anything else (including an
  unreadable row) is free, i.e. `canExport: false`, `reminderLimit: 3`.
- **`lib/billing.ts`** (server-only) is the whole surface: `isBillingConfigured()`,
  `getEntitlements(householdId)`, `createStripeClient()` (throws if unconfigured — guard
  first), `priceIdFor(locale, interval)` reading the four `STRIPE_PRICE_*` vars,
  `planForPriceId()` for the reverse lookup, `loadSubscription()` / `saveSubscription()` /
  `householdIdForCustomer()` on the admin client, and `patchFromSubscription()`.
  `current_period_end` comes off the subscription's **items** — Stripe moved it there.
- **`POST /api/stripe/checkout`** — cookie client for auth, `loadHouseholdContext()` for
  the household, 503 `{ error: "Billing is not set up yet." }` when unconfigured or when
  that locale/interval has no price. Reuses `stripe_customer_id` or creates the customer
  and stores it first, then creates a subscription Checkout Session carrying
  `household_id` in `metadata`, `client_reference_id` *and* `subscription_data.metadata`.
  Returns `{ url }`; success lands on `/settings?billing=success`.
- **`POST /api/stripe/portal`** — same guards, opens a Billing Portal session for the
  household's customer, returns `{ url }`. This is the cancel path.
- **`POST /api/stripe/webhook`** — raw `request.text()` verified with
  `constructEventAsync` against `STRIPE_WEBHOOK_SECRET`; 400 on a bad or missing
  signature, 200 no-op when billing is unconfigured. Handles
  `checkout.session.completed` (retrieves the subscription for its real status) and
  `customer.subscription.created/updated/deleted`, upserting the row keyed on
  `household_id` — found from the event metadata, else from `stripe_customer_id`.
  Unrecognised events are answered 200 and ignored; a failed *write* answers 500 so
  Stripe retries.
- **Gates in place**: `/api/export` returns 402 `{ error: "Export is a paid feature." }`
  when `!canExport`. Dashboard and `/documents` use `ExportButton` to show that gate
  in the UI (upgrade link to `/settings`) instead of a raw JSON response. The reminder
  cap is **not** enforced yet — `reminderLimit` is exposed and there is a
  `TODO(billing)` in `lib/reminders.ts` where it would go.
- **`/settings` → "Plan"** reads entitlements server-side and renders `PlanPanel`
  (client): upgrade buttons that POST to checkout, or "Manage billing" that POSTs to the
  portal, and a muted "Billing isn't set up yet" note when unconfigured. Display prices
  live in `PlanPanel` and must be kept in step with the Stripe prices.
- **To turn it on** (none of this is done yet): apply the migration, create one product
  with four recurring prices in Stripe, add a webhook endpoint at
  `<SITE>/api/stripe/webhook` for `checkout.session.completed` +
  `customer.subscription.created/updated/deleted`, enable the billing portal with
  cancellation on, then set the six `STRIPE_*` variables locally and in Vercel.

## Conventions

- Server-only modules import `server-only` at the top.
- Never reference `SUPABASE_SERVICE_ROLE_KEY` outside `lib/supabase-admin.ts`.
- Keep `.env*` out of git (already in `.gitignore`).
- New DDL goes through a migration file **and** is applied to the project; re-run
  the Supabase security advisor after DDL.
- Upload flow: client asks `createUploadTarget` (server) for a signed URL, uploads
  straight to Storage with the browser client, then calls `recordDocument` (server).

## Environment variables

Local in `.env.local` (git-ignored); mirror into Vercel (Production + Preview).

| Variable | Exposure | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | public | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | anon key for browser/server clients |
| `SUPABASE_SERVICE_ROLE_KEY` | **server-only, secret** | admin client; never expose to the browser, never commit |
| `NEXT_PUBLIC_SITE_URL` | public | base URL for auth redirect links; must equal the deployment origin |
| `ANTHROPIC_API_KEY` | **server-only, secret** | Claude vision extraction |
| `EXTRACTION_WEBHOOK_SECRET` | **server-only, secret** | must equal the Vault secret `extraction_webhook_secret` |
| `INTERNAL_TOOLS_EMAILS` | server-only | optional CSV allow-list for `/internal/*`; unset = any signed-in user |
| `RESEND_API_KEY` | **server-only, secret** | reminder email; unset = sends are logged as skipped |
| `REMINDERS_FROM_EMAIL` | server-only | From: address for reminder email (domain verified in Resend) |
| `CRON_SECRET` | **server-only, secret** | bearer token for `/api/cron/reminders`; Vercel sends it automatically |
| `STRIPE_SECRET_KEY` | **server-only, secret** | Stripe key; **unset = billing off**, gates inert, paid entitlements for everyone |
| `STRIPE_WEBHOOK_SECRET` | **server-only, secret** | signing secret for `/api/stripe/webhook`; unset = the webhook 200s and does nothing |
| `STRIPE_PRICE_GBP_MONTHLY` | server-only | price offered to UK households, £4.99/mo |
| `STRIPE_PRICE_GBP_YEARLY` | server-only | price offered to UK households, £39/yr |
| `STRIPE_PRICE_USD_MONTHLY` | server-only | price offered to US households, $6.99/mo |
| `STRIPE_PRICE_USD_YEARLY` | server-only | price offered to US households, $59/yr |

`STRIPE_SECRET_KEY` is set on Vercel production (export gate is live for free
households). Other `STRIPE_*` vars, Resend, and `CRON_SECRET` are still unset locally
and may be partially unset in Vercel — billing-off behaviour remains the fallback
when `STRIPE_SECRET_KEY` is missing.

## Verification harness

`scripts/verify-flows.mjs` runs invite-accept and delete-account checks against the
linked Supabase project using the service role (creates confirmed throwaway users,
checks shared household membership, storage purge, and orphan rows). Requires
`.env.local`. Production UI walkthrough is blocked by Supabase's built-in email rate
limit until custom SMTP is configured.

## Supabase config not captured in code (do this in the dashboard)

- **Auth → URL Configuration**: Site URL = prod origin; add
  `<NEXT_PUBLIC_SITE_URL>/auth/callback` for local + prod to the redirect allow-list.
- **Auth → Providers → Google**: add a Google OAuth client ID/secret; add
  `<SUPABASE_URL>/auth/v1/callback` as an authorized redirect URI in Google Cloud.
  The Google button errors until this is done; email + magic link work regardless.
- Built-in email is heavily rate-limited — add custom SMTP before real traffic.
- **Vault secrets** `extraction_webhook_url` + `extraction_webhook_secret` are set
  (URL → `https://homeapp-mu.vercel.app/api/extraction`). Rotate the secret by
  updating both the Vault row and Vercel's `EXTRACTION_WEBHOOK_SECRET`.
- Pre-existing security-advisor WARNs left alone: `public.rls_auto_enable()`
  (event trigger `ensure_rls`, predates this project) and `pg_net` living in the
  `public` schema (pg_net can't be relocated; its functions are in `net`, which
  PostgREST does not expose). "Leaked password protection" is off — a one-click
  dashboard toggle if wanted.

## Assumptions changed from earlier phases

- Phase 1 CLAUDE.md said "no middleware". Next 16 replaced Middleware with Proxy;
  `proxy.ts` handles Supabase session refresh + the auth redirect (now also `/internal`
  and `/settings`).
- Onboarding gate = household has a `locale` **and** at least one property row.
- `/documents` now scopes its query by `property_id` (one property per household
  for now), and its list is a client component (`DocumentsList`) for the review forms.
- Model is pinned to `claude-sonnet-4-6` for the extraction benchmark (not the
  newer default) — `EXTRACTION_MODEL` in `lib/extraction.ts`.
- `/sign-in` + `/sign-up` take `?next=`, and only the **password** flows honour it.
  Supabase matches `emailRedirectTo` / OAuth `redirectTo` against the redirect
  allow-list as whole strings (query included), so magic link and Google come back
  to the bare `/auth/callback` and `/` re-routes from there. Adding
  `<SITE>/auth/callback**` to the allow-list would let `next` survive those two.
- `/invite` is deliberately **not** in `proxy.ts`'s protected prefixes — an invite
  link has to render for a signed-out visitor.
