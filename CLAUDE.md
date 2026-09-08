@AGENTS.md

# homeapp

A new Next.js project. This file records the current plan and conventions so any
agent (or human) picking up the repo has the same context.

## Plan

1. **Scaffold only, for now.** Stand up a Next.js App Router app with TypeScript
   and Tailwind CSS, mirroring the structure and tooling conventions of the
   GraftMate repo (`../GraftMate/graftmate`).
2. **Supabase client helpers.** Provide the three standard helpers
   (`browser`, `server`, `admin`) wired to environment variables. No schema,
   no queries, no calls yet.
3. **No auth, no features.** Do not build login/signup, middleware, protected
   routes, dashboards, billing, or any product surface until the plan says so.
4. **Deploy.** Commit to `main` and push; Vercel builds from `main`.

Everything past step 4 is future work and will be added to this plan before it
is built.

## Stack

- Next.js 16 (App Router, Turbopack) + React 19
- TypeScript (strict), import alias `@/*` -> repo root
- Tailwind CSS v4 (`@tailwindcss/postcss`, `@import "tailwindcss"` in
  `app/globals.css`, with `tailwind.config.js` referenced via `@config`)
- ESLint flat config via `eslint-config-next`
- Supabase via `@supabase/ssr` + `@supabase/supabase-js`

## Structure

```
app/            App Router routes, layout, global CSS
components/      Shared React components (empty for now)
lib/            Non-UI modules
  supabase-client.ts   browser client (createBrowserClient)
  supabase-server.ts   server client with cookie bridge (server-only)
  supabase-admin.ts    service-role client (server-only, bypasses RLS)
  supabase.ts          deprecated re-export of supabase-client
```

## Environment variables

Set locally in `.env.local` (git-ignored) and in the Vercel project settings.
See `.env.example` for the list.

| Variable | Exposure | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | public | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | anon key for browser/server clients |
| `SUPABASE_SERVICE_ROLE_KEY` | **server-only, secret** | admin client; never expose to the browser, never commit |

## Conventions

- Server-only modules import `server-only` at the top.
- Never reference `SUPABASE_SERVICE_ROLE_KEY` outside `lib/supabase-admin.ts`.
- Keep `.env*` out of git (already in `.gitignore`).
