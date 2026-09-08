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

Set the secrets in the Vercel project settings (Production + Preview).
`NEXT_PUBLIC_SITE_URL` must match the deployment origin (`https://homeapp-mu.vercel.app`).

## Database

Migrations live in [`supabase/migrations/`](./supabase/migrations) and are already applied
to the linked project. Tables: `households`, `household_members`, `properties`,
`household_invites`, `documents`, `document_chunks`; plus a private `documents` Storage
bucket. Every table has row-level security scoped to household membership.

## Document extraction

A new `documents` row (`extraction_status = 'pending'`) fires a Supabase database
webhook → `POST /api/extraction` → Claude (`claude-sonnet-4-6`) vision extraction →
fields + confidence written back, full text chunked into `document_chunks`. Review and
confirm extracted fields on `/documents`. `/internal/extraction-test` is a benchmark
harness (not linked from any nav).

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
