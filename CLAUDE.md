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
| later | Reminder generation, the real dashboard, invite-accept flow. | not started |

Do not build the next phase's work until this table says so. Reminders, the
dashboard proper, and RAG are explicitly out until then.

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
  documents/            list + uploader + per-doc extraction review/confirm (DocumentsList)
  internal/extraction-test/   benchmark harness — NOT linked from any nav
  api/extraction/       POST route the Supabase DB webhook calls (nodejs, maxDuration 60)
  actions/              auth.ts, onboarding.ts, documents.ts, extraction-test.ts
components/      AuthPanel.tsx, SignOutButton.tsx
lib/
  supabase-client.ts   browser client (createBrowserClient)
  supabase-server.ts   server client with cookie bridge (server-only)
  supabase-admin.ts    service-role client (server-only, bypasses RLS)
  supabase.ts          deprecated re-export of supabase-client
  household.ts         server-only: loadHouseholdContext / isOnboarded / requireOnboarded
  extraction.ts        server-only: extractDocument() (pure Claude call) +
                       runExtractionForDocument() (download → extract → persist) + chunkText()
  document-types.ts    client-safe row/confidence shapes + REVIEW_FIELDS + DOCUMENTS_SELECT
supabase/migrations/   applied to the linked project (ref fybpmpnfocaxhqiwiyhs)
```

## Database (all in `supabase/migrations/`)

- `households(id, name, locale check UK|US, created_at)`
- `household_members(household_id, user_id, role, pk(household_id,user_id))`
- `properties(id, household_id, address, type, year_built, created_at)`
- `household_invites(id, household_id, email, invited_by, status, created_at)` — record only; accept flow is later
- `documents(...)` — upload lands `extraction_status = 'pending'`; the worker fills
  `doc_type / provider / reference / start_date / end_date / renewal_date / amount /
  currency / key_contact_name / key_contact_phone` and the `extraction_confidence`
  jsonb (`{ model, page_count, overall_confidence, flags, error, fields: {k: {value, confidence, ambiguity}} }`).
  Status flow: `pending → processing → extracted | needs_review | failed → confirmed`.
- `document_chunks(id, document_id, chunk_index, content)` — ~500-token (≈2000-char)
  plain-text chunks. Select-only RLS via the parent document; writes are service-role.
  No embeddings yet (phase 1b).
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
  `proxy.ts` handles Supabase session refresh + the auth redirect (now also `/internal`).
- Onboarding gate = household has a `locale` **and** at least one property row.
- `/documents` now scopes its query by `property_id` (one property per household
  for now), and its list is a client component (`DocumentsList`) for the review forms.
- Model is pinned to `claude-sonnet-4-6` for the extraction benchmark (not the
  newer default) — `EXTRACTION_MODEL` in `lib/extraction.ts`.
