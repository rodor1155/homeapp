# W2a go-live checklist

Use this after W2a code (steps 1–6) is merged and deployed. Step 7 is the destructive migration — **do not apply** until Ross has explicitly signed off and the soak period below is done.

## Pre-requisites (Ross, before merge)

- [ ] Re-add any bills or documents you care about **on the iPhone** (Documents → +). The web account’s server-stored files are not migrated to the device.
- [ ] Confirm no one still relies on Gmail import or server-side document upload on the web app.

## Order of operations

1. **Merge and deploy** the W2a PR (`w2a-remove-server-documents`) to production.
2. **Soak** for a few days — click through Home, Family, Calendar, Lists, Settings, sign-in/out; confirm `/documents` shows the vault handoff only.
3. **Purge Storage objects** in the `documents` bucket via the Supabase Storage API (every object under each `<household_id>/` prefix). Dropping tables alone orphans objects.
4. **Apply migration** `supabase/migrations/20261002120000_remove_server_documents.sql` (Ross’s explicit go-ahead only).
5. **Security advisor** — re-run in the Supabase dashboard after the migration.
6. **Retire env vars** in Vercel (Production + Preview): `ANTHROPIC_API_KEY`, `EXTRACTION_WEBHOOK_SECRET`, `RESEND_API_KEY`, `REMINDERS_FROM_EMAIL` (keep `CRON_SECRET` — school-calendar cron still uses it).
7. **Vault secrets** (manual, Supabase dashboard): delete `extraction_webhook_url` and `extraction_webhook_secret`.
8. **Gmail OAuth client** (Google Cloud): decommission or leave unused — no app code calls it after W2a.

## After go-live

- W2b (native renewals on iPhone) is a separate track; server `renewal_items` stay until W2b ships.
- `.env.example` can drop the retired vars on a follow-up commit once production is clean.
