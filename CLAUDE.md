@AGENTS.md

# homeapp

A Next.js + Supabase app. This file records the plan and conventions so any
agent (or human) picking up the repo has the same context.

## Plan

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Next.js App Router + TypeScript + Tailwind scaffold; three Supabase client helpers. | done |
| 2 | Auth (email/password, magic link, Google OAuth), household onboarding, document upload to Storage. | done |
| 3 | Document extraction worker — read uploaded files, fill the `documents` extraction columns, flip `extraction_status`. | next |
| later | Reminders, the real dashboard, invite-accept flow, AI features. | not started |

Do not build phase 3+ work until this table says so.

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
  page.tsx              routes to /sign-in, /onboarding, or /dashboard
  sign-in/, sign-up/    AuthPanel (client) — password + magic link + Google
  auth/callback/        PKCE code exchange (magic link, OAuth, email confirm)
  auth/sign-out/        POST route handler
  onboarding/           3-step wizard (locale -> property -> partner invite)
  dashboard/            placeholder, gated on completed onboarding
  documents/            list + drag/drop + camera-capture uploader
  actions/              server actions: auth.ts, onboarding.ts, documents.ts
components/      AuthPanel.tsx, SignOutButton.tsx
lib/
  supabase-client.ts   browser client (createBrowserClient)
  supabase-server.ts   server client with cookie bridge (server-only)
  supabase-admin.ts    service-role client (server-only, bypasses RLS)
  supabase.ts          deprecated re-export of supabase-client
  household.ts         server-only: loadHouseholdContext / isOnboarded / requireOnboarded
supabase/migrations/   applied to the linked project (ref fybpmpnfocaxhqiwiyhs)
```

## Database (all in `supabase/migrations/`)

- `households(id, name, locale check UK|US, created_at)`
- `household_members(household_id, user_id, role, pk(household_id,user_id))`
- `properties(id, household_id, address, type, year_built, created_at)`
- `household_invites(id, household_id, email, invited_by, status, created_at)` — record only; accept flow is later
- `documents(...)` — extraction columns are written by the phase-3 worker; uploads land with `extraction_status = 'pending'`
- Private Storage bucket `documents`, key pattern `<household_id>/<document_id>/<filename>`

RLS model: every table (and the bucket) is gated on
`private.is_household_member(household_id)` — a `SECURITY DEFINER` helper in the
non-exposed `private` schema. New rows are reachable because
`public.handle_new_user()` (trigger on `auth.users`) drops every new signup into
their own household as `owner`. `public.prune_empty_household()` (trigger on
`household_members` delete) removes a household once it has no members, cascading
to properties/documents/invites. Orphaned **Storage objects** are not yet cleaned
up — a known gap for a later lifecycle job.

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

## Supabase config not captured in code (do this in the dashboard)

- **Auth → URL Configuration**: Site URL = prod origin; add
  `<NEXT_PUBLIC_SITE_URL>/auth/callback` for local + prod to the redirect allow-list.
- **Auth → Providers → Google**: add a Google OAuth client ID/secret; add
  `<SUPABASE_URL>/auth/v1/callback` as an authorized redirect URI in Google Cloud.
  The Google button errors until this is done; email + magic link work regardless.
- Built-in email is heavily rate-limited — add custom SMTP before real traffic.
- Pre-existing `public.rls_auto_enable()` (event trigger `ensure_rls`) trips the
  security advisor; it predates this project and was left alone.

## Assumptions changed from phase 1

- Phase 1 CLAUDE.md said "no middleware". Next 16 replaced Middleware with Proxy;
  `proxy.ts` now exists for Supabase session refresh + the auth redirect.
- Onboarding gate = household has a `locale` **and** at least one property row.
