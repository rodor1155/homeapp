# W2 — remove server-side document storage (plan for review; nothing here has been applied)

Status: **DECIDED 2 Oct 2026 (Ross); W2a code removal in progress on branch `w2a-remove-server-documents`.** Originally written 30 Sep 2026 as plan-only. Step 7 (destructive migration) is NOT applied and needs Ross's explicit go-ahead at the time. Decisions it implements: **D4** (no legacy migration window, remove server document storage), **D1** (no email reminders, no server-held summaries), **D7** (Gmail import and timetable reading are rebuilt on-device later, not in 1.0).

## 0. Before anything is deleted — two things only Ross can do

1. **Rescue any documents you care about on the web account.** The web account currently holds at least two server-stored documents (`image.jpg`, "Mole Valley District Council" and "SES Water", filed 14 Sep 2026; screenshots 30 Sep). Re-add them through the iPhone app (Documents → +) before the table and bucket are dropped. There is no export-to-device path and none is planned (D4).
2. **Confirm scope** for the two product choices in section 4.

## 1. Where server documents live today

| Layer | What | Files |
| --- | --- | --- |
| Tables | `documents`, `document_chunks`, `reminders`, `reminder_events`, `reminder_rules`, `gmail_connections`, `gmail_import_candidates`; `renewal_items.document_id` (FK, nullable) | `supabase/migrations/20260908110841_documents.sql`, `…documents_extraction_schema.sql`, `…documents_category.sql`, `…documents_home_inbox_category.sql`, `20260909160000_reminders.sql`, `20260914130000_gmail_import.sql`, `20260926100000_renewal_items.sql` |
| Storage | private bucket `documents` (`<household_id>/<document_id>/<file>`) + its policies | `20260908110857_documents_storage_bucket.sql` |
| Trigger | `documents_extraction_webhook` → `private.notify_extraction_webhook()` → Vault secrets `extraction_webhook_url` / `extraction_webhook_secret` → `POST /api/extraction` | `20260908115810_documents_extraction_webhook.sql` |
| Server routes | `app/api/extraction`, `app/api/export` (documents part), `app/api/gmail/{connect,callback}`, `app/api/cron/reminders` | |
| Server actions | `app/actions/documents.ts`, `extraction-test.ts`, `gmail.ts`, parts of `renewals.ts`, `timetable.ts` | |
| Libraries | `lib/extraction.ts`, `lib/reminders.ts`, `lib/email.ts` (Resend), `lib/gmail.ts`, `lib/gmail-config.ts`, `lib/document-types.ts`, `lib/categories.ts`, `lib/home-overview.ts`, `lib/home-summary.ts`, `lib/timetable-extract.ts`, parts of `lib/coming-up.ts`, `lib/ics-feed-load.ts`, `lib/account-deletion.ts` | |
| UI | `app/(app)/documents/*` (list, uploader, Gmail panels), `components/PropertyHub.tsx` + `app/(app)/dashboard/HouseFileSection.tsx` (the "house file" drawers link to `/documents?category=`), dashboard `overview-data.ts`, `family/page.tsx` ("Track renewal" offer), `components/RenewalEditSheet.tsx` | |
| Third parties that see document data | **Anthropic** (extraction: document bytes/images → `lib/extraction.ts`; summary: name/category/type/dates/amount of each doc → `lib/home-summary.ts`; timetable photos → `lib/timetable-extract.ts`), **Resend** (reminder email: document provider/dates), **Google** (Gmail import) | |

The last row is the privacy gap W2 closes: Hearth's rule is that Rodor servers never receive document bytes or extracted text. The on-device vault already honours it; these server paths do not.

## 2. Proposed removal, in safe order (each step is independently deployable and reversible until step 7)

1. **Stop creating new server documents** (code only): hide/redirect `/documents` for everyone, remove the uploader, `createUploadTarget`, `recordDocument`, `reprocessDocument`, `confirmExtraction`; remove `AddDocumentSheet`/Gmail panels. In the iPhone shell this is already redirected to the native vault (W1).
2. **Stop the egress**: delete `app/api/extraction`, `lib/extraction.ts`, `app/actions/extraction-test.ts`, `lib/home-summary.ts` and `HouseFileSection`'s summary call, `lib/timetable-extract.ts` and the extract parts of `app/actions/timetable.ts` (timetable slots stay editable by hand), Gmail routes/actions/libs. Remove `@anthropic-ai/sdk` from `package.json` if nothing else uses it.
3. **Retire email reminders** (D1): delete `app/api/cron/reminders`, `lib/reminders.ts`, `lib/email.ts`, the `0 8 * * *` cron in `vercel.json`. Keep the school-calendar cron. `renewal_items` (manual renewals) stay; they already don't feed the email engine.
4. **Re-point the derived features that still read `documents`**: `lib/coming-up.ts` `documentEntries()`, `lib/ics-feed-load.ts` (document renewal/end dates in the subscribe feed), `app/api/export/route.ts` (documents part), dashboard `overview-data.ts`, `lib/account-deletion.ts` (Storage purge + Gmail revoke become no-ops until the bucket is dropped, then delete those steps). `renewal_items.document_id` is dropped in the migration.
5. **Decide the house-file hub** (section 4) and update `PropertyHub`/`HouseFileSection` accordingly.
6. **Privacy copy**: `app/privacy`, `app/account-deletion` (remove "documents you upload to Hearth's servers", Gmail, email reminders); keep the honest statement that documents live on-device and sync through the user's own iCloud.
7. **Destructive, needs Ross's explicit go-ahead at the time:** apply a migration that (a) removes the webhook trigger/function and the Vault secrets, (b) **deletes every object in the `documents` bucket through the Storage API first** (dropping the bucket row alone orphans objects), (c) drops `document_chunks`, `documents`, `reminder_events`, `reminders`, `reminder_rules`, `gmail_import_candidates`, `gmail_connections`, and the `renewal_items.document_id` column, (d) re-runs the Supabase security advisor. A draft `supabase/migrations/…_remove_server_documents.sql` should be written and reviewed but only applied on the go-ahead.
8. **Retire env vars and secrets** in Vercel/Supabase: `ANTHROPIC_API_KEY` (unless something new needs it), `EXTRACTION_WEBHOOK_SECRET`, `RESEND_API_KEY`, `REMINDERS_FROM_EMAIL`, `CRON_SECRET` (only if the school-calendar cron is the last user — it is not, keep it), Gmail OAuth scopes/credentials, Vault `extraction_webhook_*`.

## 3. Risks and how to contain them

- **No automated tests on the web app** (`npm run build`, `eslint`, `tsc` only, plus the service-worker and link scripts). Removal must be done in small commits, each followed by build + lint + typecheck, and a manual click-through of Home, Family, Calendar, Lists, Settings, sign-in/out.
- **Entanglement with the live household features** (Family, Calendar, Lists, Who's-where, kid view, invites, billing) means nothing under step 7 is safe to apply until steps 1–6 have been live for a few days.
- **Data loss is permanent** after step 7 (no backups of Storage objects are assumed). See section 0.
- **Service worker**: `public/sw.js` never caches `/api`, so none of this affects the offline cache.

## 4. Two product choices needed (Ross)

1. **What replaces the "house file" drawers on Home?** Today the hub groups server documents into seven categories. Options: (a) remove the hub and let Home show only Coming up/people/lists; (b) make each drawer open the native vault filtered by category (needs a small native change: category is not stored on-device today); (c) keep drawers as empty shortcuts that open the native vault. Recommendation: (a) now, (b) later.
2. **Renewals** (passports, MOT, boiler service): keep as a manual, server-stored feature (no document attachment), or move on-device too? Recommendation: keep server-side for now; the "Track renewal" offer that started from a document goes away.

## 4b. Decisions (Ross, 2 Oct 2026)

1. **House-file hub: drop it** (option a). Home shows only Coming up / people / lists. `PropertyHub`, `HouseFileSection` and their summary call are deleted.
2. **Renewals move to the phone.** This is a separate native feature (**W2b**), not part of W2a. Until W2b ships, `renewal_items` stay server-side as manual renewals (no document attachment; the document "Track renewal" offer is removed).

Split: **W2a** = steps 1-6 (+ a drafted, unapplied step-7 migration). **W2b** = native renewals on the iPhone, then retire the server `renewal_items` table.

## 5. Estimated effort

Steps 1–6: one focused day of agent-assisted work with a manual click-through. Step 7 is minutes once approved, plus the Storage object purge.
