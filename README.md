# homeapp

Next.js (App Router) + TypeScript + Tailwind CSS scaffold. See [CLAUDE.md](./CLAUDE.md) for the plan.

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

Set all three in the Vercel project settings (Production + Preview) as well.

## Deploy

Vercel builds from `main`.
