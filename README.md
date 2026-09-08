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

Set all four in the Vercel project settings (Production + Preview). `NEXT_PUBLIC_SITE_URL`
must match the deployment origin there (e.g. `https://homeapp.vercel.app`).

## Database

Migrations live in [`supabase/migrations/`](./supabase/migrations) and are already applied
to the linked project. Tables: `households`, `household_members`, `properties`,
`household_invites`, `documents`; plus a private `documents` Storage bucket. Every table
has row-level security scoped to household membership.

## Supabase config that isn't in code

- **Auth → URL Configuration**: add `${NEXT_PUBLIC_SITE_URL}/auth/callback` (local and
  prod) to the redirect allow-list; set the Site URL to the prod origin.
- **Auth → Providers → Google**: paste a Google OAuth client ID/secret and add
  `${SUPABASE_URL}/auth/v1/callback` as an authorized redirect URI in Google Cloud.
  Until then the "Continue with Google" button returns an error; email + magic link work.
- The built-in email sender is rate-limited; add custom SMTP before real traffic.

## Deploy

Vercel builds from `main`.
