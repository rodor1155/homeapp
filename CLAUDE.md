@AGENTS.md

# homeapp — "Hearth Home"

A Next.js + Supabase app. This file records the plan and conventions so any
agent (or human) picking up the repo has the same context. The product is
being called **Hearth Home** in the UI (brand copy, emails, `lib/brand.ts`)
as of the mid-September rebrand; the working-name decision in Notion is
still formally open, so don't be surprised if it changes again — check
`lib/brand.ts` for the current live name rather than assuming this doc.

## Plan

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Next.js App Router + TypeScript + Tailwind scaffold; three Supabase client helpers. | done |
| 2 | Auth (email/password, magic link, Google OAuth), household onboarding, document upload to Storage. | done |
| 3 | Document extraction worker — DB webhook → Claude vision → fields + confidence + chunked text; review/confirm UI; internal test harness. | done |
| 1b | Embeddings for `document_chunks` + retrieval (ask-your-home RAG). | not started |
| 3b | Mistral OCR fallback for `needs_review` long / poor-quality scans (after the 20-doc benchmark). | not started |
| 3c | Household invite-accept flow (`/invite` + three SECURITY DEFINER RPCs). | done, applied |
| 4 | Reminder engine — dates → `reminders` rows → daily cron → Resend email. | done, applied; Resend + `CRON_SECRET` wired on Vercel |
| 5 | Settings — household/property/locale editing, people + invites, sign out, account deletion. | done, applied |
| 6 | Billing — Stripe subscriptions, checkout + portal + webhook, export gate, plan card. | done, migration applied; confirm the four `STRIPE_PRICE_*` + `STRIPE_WEBHOOK_SECRET` are set before relying on it end-to-end |
| 7 | Home solution slice 1 — household people + schools + key dates, birthdays, property hub. | done, applied |
| 7b | School calendar (ICS) linking, per school. | done, applied |
| 7c | Household (shared) ICS calendars — a family Google calendar, a club's fixtures, cached the same way as a school's. | done, applied |
| 8 | Shopping lists — several lists per household, checklist items, tick/untick. | done, applied |
| 9 | Family-life v2 (overnight build, 12 Sept) — school timetable, household routines, meal plan, who's-where, maintenance clock, guests pack, shared inbox, device-local child view. | done, applied — see below |
| 10 | Gmail document import — read-only OAuth scan of the last 12 months for household PDFs, review-before-confirm. | done, applied |
| 11 | Hub / Lounge mode — read-mostly `/hub` display for a kitchen iPad. | done (no migration; composes existing loaders) |
| 12 | iOS via Capacitor — thin native shell in a **separate** repo (`ios-shell-template`), loads this app's live URL. | in progress — see iOS section; last known blocker was an App Store Connect Issuer ID |
| 13 | Rebrand to "Hearth Home" — `AppMark`, deepened ink/navy/sage palette, map-forward hero. | mostly done — working name still formally undecided in Notion |

Every migration file under `supabase/migrations/` is applied to the linked
project (`fybpmpnfocaxhqiwiyhs`) as of this writing — verified against the
live migration history, not just the filesystem. If you add a new one,
apply it and don't leave that step for later; nothing in this codebase
should describe a column or table that doesn't exist yet in production.

"Do not build the next phase's work until this table says so" is the
**default absent other instruction** — it exists so an autonomous agent
doesn't wander. It is not absolute: phase 9 shipped because Ross directly
asked for an overnight build outside this table, and the table was updated
afterwards to match. A direct, explicit ask from Ross overrides the table;
guessing ahead on your own initiative does not.

## Design system — "the household ledger"

One visual system, defined once, used by every screen.

- **Tokens live in `app/globals.css`** — a `@theme` block (Tailwind v4 native, so
  `bg-paper` / `text-ink` / `text-lg` / `rounded` etc. are generated) plus a
  `@media (prefers-color-scheme: dark)` `:root` override of the same custom
  properties. Never hard-code a colour or a one-off font size in a component.
  - Palette (same token names as always — `paper`, `ink`, `rule`, `ochre`,
    `sage`, `navy`, `oxblood`, plus `*-tint` / `*-soft` / `*-wash` variants):
    the *values* were deepened in the rebrand pass (`--color-paper` moved
    from a cool grey to a warm cream, `--color-sage`/`--color-navy` tints
    deepened) — the token names and what they mean did not change, so
    existing component classes keep working. Don't hand-pick a new hex; if
    the palette needs another shift, change it in `@theme`.
  - Type: **Fraunces** (display / headings) + **IBM Plex Sans** (body, with
    `.tnum` tabular figures), loaded in `app/layout.tsx` as `--font-fraunces`
    / `--font-plex`. Unchanged by the rebrand.
  - Geometry: `--radius` 4px (8px for the auth sheet). **No drop shadows** —
    depth comes from paper tones + hairlines.
- **Motif classes** (also in `globals.css` `@layer components`): `.ledger-bound`,
  `.sheet`, `.ruled-row` (via `<SectionHeading>`), `.field-input`, `.btn` /
  `.btn-quiet` / `.btn-danger`, `.pill` + `.pill-high|medium|low`, `.entry` +
  `.entry--filed|review|fault`, `.mark-filed|review|fault|muted`,
  `.margin-note`, plus rebrand additions: `.card-promo` (+`-navy`/`-sage`
  variants, the two Home CTA tiles), `.icon-well`, `.home-hero-*` (map
  underlay, scrim, glass overlay greeting).
- **Primitives in `components/ui.tsx`**: `LedgerPage`, `Wordmark`,
  `SectionHeading`, `Card`, `Button`, `Field`, `ConfidencePill`, `StatusMark` +
  `STATUS_META` / `statusEdgeClass`.
- **`components/AppMark.tsx`** — the house-mark icon on `bg-sage-tint`
  (sm/md/lg), used on auth screens and the dashboard hero; the wordmark was
  removed from the signed-in header in the rebrand (see "Home affordance
  drift" below), so this is now the primary in-app brand mark day to day.
- **`lib/brand.ts`** — `APP_NAME` and `appTitle(page)` (`"${page} · Hearth
  Home"`). Every page `<title>` should go through this, not a literal string.
- **Tone**: plain-spoken and domestic, never SaaS. Status is shown as words
  ("Filed", "Needs a look"), not badges.
- `/internal/extraction-test` is deliberately left unstyled.

## Stack

- Next.js 16 (App Router, Turbopack) + React 19
- TypeScript (strict), import alias `@/*` -> repo root
- Tailwind CSS v4 (`@tailwindcss/postcss`, `@import "tailwindcss"` in
  `app/globals.css`, with `tailwind.config.js` referenced via `@config`)
- ESLint flat config via `eslint-config-next`
- Supabase: `@supabase/ssr` (cookie-based sessions) + `@supabase/supabase-js`
- `node-ical` for ICS calendar feeds (server-only; ships its own types)
- `sharp` for the home-map tile stitch (`/api/home-map`) — a **declared**
  dependency (`package.json`), not left to Next's optional transitive copy
- `@capacitor/app` + `@capacitor/browser` — used only by
  `components/NativeOAuthListener.tsx` / `lib/native-google-sign-in.ts` to
  talk to the native shell when one is present; harmless web fallbacks when
  it isn't (see iOS section)
- Claude vision is called from two places now: `lib/extraction.ts`
  (documents) and `lib/timetable-extract.ts` (school timetables) — both
  server-only, both pinned to `EXTRACTION_MODEL`

## Structure

```
proxy.ts        Session refresh + auth gate. Next 16 renamed Middleware -> Proxy;
                the file is proxy.ts, the export is `proxy`. Do NOT add middleware.ts.
                PROTECTED_PREFIXES: /calendar /dashboard /documents /family
                /hub /lists /settings /onboarding /internal.
app/
  page.tsx              routes to /sign-in, /invite, /onboarding, or /dashboard
  sign-in/, sign-up/    AuthPanel (client) — password + magic link + Google
  auth/callback/        PKCE code exchange (magic link, OAuth, email confirm)
  auth/native-bridge/   HTTPS hand-off page for native Google sign-in (see iOS)
  auth/sign-out/        POST route handler
  onboarding/           3-step wizard (locale -> property -> partner invite)
  privacy/               public privacy policy (App Store requirement)
  (app)/                the signed-in tabs. A route group, so the URLs are unchanged.
    layout.tsx          requireOnboarded() once + <ShellRouter> round `{children}`
    loading.tsx          the skeleton a tab shows between the tap and the page
    dashboard/           Home: map hero + Coming up + house-file peek (see
                         "Home UI" section — several dashboard/*.tsx files here
                         are no longer rendered on Home, see drift note)
    documents/            list + Add document sheet (camera/file/Gmail) + per-doc
                         extraction review/confirm; reads `?category=` and `?upload=1`
    family/               who lives here + schools + key dates + timetable +
                         routines + meals + who's-where (see Family-life v2)
    calendar/              month grid + tappable day list, birthdays/events/school
                         feeds/shared feeds merged, `?ym=` and `?day=`
    lists/                 the shopping lists (ListsPanel) + `[listId]/` (ItemsPanel)
    settings/               household/property/locale, plan, people/invites, guest
                         pack, sign out, delete account, Hub display link
    hub/                    read-mostly kitchen-iPad display — its own chrome
                         (HubShell, not AppShell), see Hub section
  invite/                 pending invites, accept/decline; works signed out
  internal/extraction-test/     benchmark harness — NOT linked from any nav
  api/extraction/          POST route the Supabase DB webhook calls (nodejs, maxDuration 60)
  api/stripe/               checkout/ + portal/ + webhook/ POST routes (nodejs)
  api/gmail/                connect/ (starts OAuth) + callback/ (exchange + redirect)
  api/home-map/             signed, cached OSM/CARTO tile stitch for the hero
  api/address-lookup/       Ideal Postcodes (fallback postcodes.io) address picker
  api/cron/reminders/       daily reminder send
  api/cron/school-calendars/  daily ICS refresh (schools + household calendars)
  actions/                  auth.ts, onboarding.ts, documents.ts, invites.ts,
                           extraction-test.ts, settings.ts, account.ts, family.ts,
                           lists.ts, gmail.ts, guests.ts, meals.ts, routines.ts,
                           timetable.ts, whos-where.ts
components/
  ui.tsx                   design primitives
  AuthPanel.tsx, SignOutButton.tsx
  AppMark.tsx               brand mark (see Design system)
  ShellRouter.tsx           client: picks AppShell vs HubShell by pathname
  AppShell.tsx               signed-in chrome: sticky header (ShellGreeting) +
                           <main> + CreateFab + BottomTabBar. Rendered once by
                           ShellRouter/layout.tsx, never by a page.
  ShellGreeting.tsx          greeting/settings-link/avatar, two variants: "header"
                           (sticky bar, other tabs) and "overlay" (frosted glass
                           on the Home map hero)
  PreAppShell.tsx           shared chrome for signed-out screens (mark + wordmark)
  BottomTabBar.tsx           5 tabs: Home / Family / Calendar / Lists / Documents;
                           Documents hidden in child view mode
  CreateFab.tsx + CreateSheet.tsx   centre "+" on every (app) tab (not /hub) ->
                           bottom sheet: Document / Key date / Shopping list / Person
  BottomSheet.tsx            generic reusable sheet primitive (portal, swipe-to-
                           dismiss, Escape, body-scroll lock, hides the FAB while
                           open) — used by CreateSheet, CalendarEventDetailSheet
                           and AddDocumentSheet
  CalendarEventDetailSheet.tsx   tap a calendar/Coming-up entry -> when/where/
                           description/link, via lib/calendar-event-detail.ts
  PropertyHub.tsx             "the house file": one drawer per category, `variant`
                           "full" (all 8, /documents) or "peek" (busiest 4, Home)
  category-icons.ts           icon + short label + CATEGORY_TONE per category
  NativeOAuthListener.tsx     app-wide: Capacitor deep-link listener for native
                           Google sign-in hand-off (see iOS section)
  ViewModeToggle.tsx           adult/child mode, localStorage only, device-local,
                           not an access control — hides the Documents tab/option
  HubShell.tsx, HubClock.tsx, HubDisplayLink.tsx, HubRefresh.tsx   /hub chrome
lib/
  categories.ts             client-safe CATEGORIES (8, incl. "Home inbox") /
                           categorise() / effectiveCategory()
  supabase-client.ts, supabase-server.ts, supabase-admin.ts, supabase.ts
  household.ts               server-only: loadHouseholdContext (cache()d) /
                           requireOnboarded
  extraction.ts               server-only: document extraction (Claude vision)
  timetable-extract.ts        server-only: school-timetable extraction (Claude
                           vision, separate from documents — doesn't touch the DB)
  document-types.ts           client-safe row/confidence shapes
  invites.ts, members.ts
  billing.ts                  server-only Stripe entitlements/checkout/portal helpers
  property.ts                 PROPERTY_TYPES picklist
  family.ts                   client-safe: HouseholdPerson (incl. `relation`) /
                           School (incl. `postcode`) / HouseholdEvent /
                           SchoolCalendarEvent + arithmetic
  household-calendar.ts       server-only: sync a household's own ICS feed
                           (same shape as school-calendar.ts, one level up)
  school-calendar.ts           server-only: sync a school's ICS feed
  ics.ts                       shared ICS fetch/parse/pin used by both syncs
  timetable.ts                 client-safe: person_timetable_slots load +
                           Coming-up/calendar expansion + kit-flag inference
  school-year-match.ts          pure: match a school ICS event's title (e.g.
                           "Y7 trip") against a household's children's year
                           groups, to filter irrelevant whole-school noise
  routines.ts                   client-safe: household_routines load +
                           weekly/fortnightly/monthly Coming-up expansion
  meals.ts                      client-safe: household_meal_plans (Mon-Sun) load
  whos-where.ts                  client-safe: person_day_status load, status suggestions
  guests.ts                      client-safe: guest-pack (5 columns on households)
  gmail-config.ts, gmail.ts     server-only: Gmail OAuth + scan + candidates
  is-capacitor-native.ts        client: detect the Capacitor iOS shell at runtime
  native-oauth.ts, native-google-sign-in.ts, public-app-origin.ts   iOS OAuth plumbing
  hub-data.ts                    server-only: composes existing loaders for /hub
  calendar-event-detail.ts        client-safe: map a calendar item / Coming-up
                           entry to a tappable detail-sheet payload
  calendar-month.ts               month-grid + day-list shaping, incl. the
                           school-year filter
  coming-up.ts                    server-only: the one merged dated list —
                           documents, birthdays, household events, school +
                           household calendar feeds, timetable, routines
  dates.ts                        client-safe date formatting
  tones.ts                        shared colour-tone <-> pill class mapping
  html-entities.ts                 decode ICS text entities
  safe-path.ts                     safeNextPath()
supabase/migrations/   applied to the linked project (ref fybpmpnfocaxhqiwiyhs) —
                       all 25 files, verified against the live migration history
docs/
  ios-capacitor-kickoff.md      the iOS shell plan/status (shell lives in a
                               separate repo — see iOS section)
  hub-lounge-mode-sketch.md      the /hub spec (three-column kitchen display)
```

## Database (all in `supabase/migrations/`, all applied to `fybpmpnfocaxhqiwiyhs`)

- `households(id, name, locale check UK|US, created_at, wifi_name, wifi_password,
  spare_key_note, bin_day_note, school_run_note)` — the last five columns are the
  **guest pack** (settings-only form, `lib/guests.ts` / `app/actions/guests.ts`);
  `wifi_password` is stored and rendered as plain text, not masked.
- `household_members(household_id, user_id, role, pk(household_id,user_id))` —
  emails come from `public.household_member_emails(uuid)` (SECURITY DEFINER).
- `properties(id, household_id, address, type, year_built, created_at)`
- `household_people(id, household_id, user_id null → auth.users, name, kind check
  adult|child|other, relation null check (wife|husband|partner|mother|father|
  daughter|son|sister|brother|grandmother|grandfather|guardian|other), birthday
  date null, school_id null → schools, year_group null, notes null, sort_order,
  created_at)` — `relation` is a soft-checked free label for the address-book-style
  people list; blank/unknown is cleared in the app rather than rejected by the DB.
- `schools(id, household_id, name, address null, postcode null, notes null,
  created_at, calendar_url null, calendar_title null, calendar_last_synced_at
  null, calendar_last_error null)` — `schools_household_name_unique` backs the
  app-level de-dup in `findOrCreateSchool`.
- `school_calendar_events(..., description text null, url text null)` — the ICS
  cache for a school's feed, today → +120 days, dropped and rebuilt on every
  sync. `description`/`url` (24 Sept) feed `CalendarEventDetailSheet`.
- `household_calendars(id, household_id, name, calendar_url null, calendar_title
  null, calendar_last_synced_at null, calendar_last_error null, created_at)` +
  `household_calendar_events(..., calendar_id, description text null, url text
  null, unique(calendar_id, uid))` — the household's own shared ICS feeds (a
  family Google calendar, a club's fixtures), same read-mostly cache shape as a
  school's, plain member read/write on the parent, service-role-only on the
  cached events. `lib/household-calendar.ts` is the sync surface.
- `household_events(id, household_id, title, event_date, event_type check
  birthday|school|home|other, person_id null, school_id null, notes null,
  created_at)` — dates someone typed in. Birthdays are never mirrored here —
  derived from `household_people.birthday`.
- `person_timetable_slots(id, household_id, person_id → household_people, weekday
  0-6, start_time/end_time text HH:MM, period_label, subject not null, location,
  bring_kit bool, kit_label, bring_ingredients bool, ingredients_note, notes,
  source_document_id null → documents, sort_order, created_at)` — a child's
  school-week timetable; insert/update also require the person to belong to the
  caller's household. `source_document_id` exists at the schema level (to link a
  slot back to the scan it came from) but nothing currently sets it — wired at
  the DB, not the app, yet.
- `household_routines(id, household_id, title, cadence check weekly|fortnightly|
  monthly, weekday 0-6 null, day_of_month 1-28 null, anchor_date date null,
  notes, active bool default true, sort_order)` — recurring household beats
  (bin night, library books). A table check enforces weekday for weekly/
  fortnightly and day_of_month for monthly.
- `household_meal_plans(id, household_id, week_start date (Monday, Europe/
  London), weekday 0-6, title not null, ingredients_note, sort_order,
  unique(household_id, week_start, weekday))` — one row per weekday per week;
  `ingredients_note` is free text, no structured quantity/unit list. The
  shopping-list hook (`addMealIngredientsToList`) is a one-tap manual action
  that naively splits the note on `\n , ;` into `shopping_list_items` rows —
  not automatic on save.
- `person_day_status(id, household_id, person_id → household_people, status_date
  date, status_text not null, updated_at, unique(person_id, status_date))` —
  "who's where today"; same person-belongs-to-household RLS shape as timetable
  slots.
- `documents(...)` — as before, plus `category` now allows an eighth value,
  `"Home inbox"` (school letters / permission slips / correspondence), which
  both the manual uploader and the Gmail-import auto-categoriser can assign.
- `gmail_connections(id, household_id unique, user_id → auth.users, gmail_address,
  access_token, refresh_token, token_expires_at, last_scan_at, last_scan_error,
  created_at, updated_at)` — **one Gmail account per household** (connecting a
  second one overwrites the first, `onConflict: "household_id"`). RLS is
  enabled but has **no policies for `authenticated`** — service-role only, by
  design (comment in the migration). Tokens are stored in plaintext (no
  pgsodium/vault wrapping) — mitigated by, not replaced by, the missing RLS
  grants; worth encrypting at rest if this ever needs a compliance story.
- `gmail_import_candidates(id, household_id, connection_id → gmail_connections,
  gmail_message_id, gmail_attachment_id, filename, subject, sender, received_at,
  suggested_category, status check pending|imported|dismissed|failed, document_id
  null → documents, import_error, created_at, unique(connection_id,
  gmail_message_id, gmail_attachment_id))` — lightweight metadata only; no
  attachment bytes are downloaded or stored until the household confirms an
  import. Members can select/update/delete; no insert policy (rows come from
  `scanGmailForCandidates()` on the service role).
- `document_chunks(id, document_id, chunk_index, content)` — no embeddings yet
  (phase 1b).
- `reminder_rules`, `reminders`, `reminder_events` — unchanged from phase 4.
- `subscriptions(household_id pk → households, stripe_customer_id,
  stripe_subscription_id, status default 'none', plan, current_period_end,
  cancel_at_period_end, updated_at)` — migration applied; confirm the
  remaining `STRIPE_*` env vars before assuming checkout/webhook work
  end-to-end in a given environment.
- Private Storage bucket `documents`, key pattern `<household_id>/<document_id>/<filename>`

RLS model unchanged: every table (and the bucket) is gated on
`private.is_household_member(household_id)`. Household resolution in server
actions is consistently "the caller's oldest `household_members` row" —
repeated by hand in `family.ts`, `settings.ts`, `lists.ts`, `gmail.ts`,
`guests.ts`, `meals.ts`, `routines.ts`, `timetable.ts`, `whos-where.ts`; there
is no shared helper for it yet, so a schema/behaviour change to that rule
means editing all of them.

## Extraction worker (phase 3)

- **Trigger**: `documents_extraction_webhook` (after insert on `public.documents`)
  → `net.http_post` to the URL in Vault secret `extraction_webhook_url`, with
  `x-webhook-secret` from Vault secret `extraction_webhook_secret`. Fires only
  for `extraction_status = 'pending'`.
- **Route** `POST /api/extraction`: constant-time-compares `x-webhook-secret`
  against `EXTRACTION_WEBHOOK_SECRET`, then `runExtractionForDocument(record.id)`.
  Gmail-imported documents go through this **same** path — `importGmailCandidates`
  inserts a `pending` `documents` row directly (via `importDocumentFromBuffer`,
  admin client) and lets the DB webhook pick it up, rather than calling
  extraction inline.
- **`extractDocument()`**: `claude-sonnet-4-6` (`EXTRACTION_MODEL`) vision,
  forced tool call. PDFs > 8 pages or files > 20 MB are parked as
  `needs_review` without calling Claude. Status flow:
  `pending → processing → extracted | needs_review | failed → confirmed`.
- **Review UI**: `/documents` — the Add document sheet feeds it manual uploads
  and confirmed Gmail imports alike; both land in the same review form.
- **`/internal/extraction-test`**: unchanged, gated to `INTERNAL_TOOLS_EMAILS`.

## Reminder engine (phase 4)

Unchanged from earlier phases — see `lib/reminders.ts`, `lib/email.ts`,
`GET /api/cron/reminders`. Still only covers documents; nothing emails a
birthday, a timetable kit reminder, a routine, or a shared-calendar date —
those only ever show on Coming up / the calendar / the Hub display.

## Settings + account deletion (phase 5)

- **`/settings`** cards: "Your household", "Plan", "People", **"Guest pack"**
  (new — wifi/keys/bins/school-run notes, see Database), a link to the Hub
  display (`HubDisplayLink`), sign out, delete account.
- `app/actions/settings.ts` / `app/actions/account.ts` — unchanged.

## Billing (phase 6)

Unchanged in mechanism from earlier phases (`lib/billing.ts`, the three
Stripe routes, `ExportButton`, `PlanPanel`). The `subscriptions` migration
is now **applied**; before relying on checkout/webhook working end-to-end in
a given environment, confirm `STRIPE_WEBHOOK_SECRET` and the four
`STRIPE_PRICE_*` vars are actually set there (`STRIPE_SECRET_KEY` alone
keeps the export gate live but isn't sufficient for a working subscription).

## Property hub + filing categories

- **`lib/categories.ts`** now lists **eight** `CATEGORIES` (added "Home
  inbox" for school letters / permission slips / correspondence, alongside
  the original seven). `categorise()` / `effectiveCategory()` unchanged in
  shape.
- **`components/PropertyHub.tsx`** takes a `variant`: `"full"` (all 8
  drawers, used on `/documents`) or `"peek"` (the 4 busiest by document
  count, used on the Home hero peek). `CATEGORY_TONE` in
  `components/category-icons.ts` gives each category a pill tone.
- **`/documents`** reads `?category=` / `?upload=1` as before; the Add
  document sheet (see below) replaced the old plain uploader.

## Gmail document import

- **Add document sheet** (`app/(app)/documents/AddDocumentSheet.tsx`) has
  three steps: `add` (Connect Gmail / Connect Outlook [disabled, "Coming
  soon" stub] / Take photo / Browse files / Upload from cloud storage
  [stub] / Share from other apps [stub] / Email to Hearth Home [stub]) →
  `gmail-explain` (`GmailExplainPanel`, explains the flow, Connect or Scan
  button) → `gmail-review` (`GmailImportReview`, tick candidates, pick a
  category per row, **nothing is stored until "Import N documents" is
  pressed**).
- **OAuth**: `GET /api/gmail/connect` (requires sign-in, sets a CSRF `state`
  in an httpOnly cookie, 10-min TTL, redirects to Google) →
  `GET /api/gmail/callback` (validates state, exchanges the code, resolves
  the caller's household, saves the connection). Scope is
  **`gmail.readonly` only**. `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are
  a **separate** Google Cloud OAuth client from the one Supabase Auth uses
  for "Continue with Google" sign-in — different env vars, different
  redirect URI (`{SITE}/api/gmail/callback` vs `{SUPABASE_URL}/auth/v1/callback`),
  configured in different places (app env vars vs. the Supabase Auth
  dashboard). Don't conflate the two when debugging either.
- **`lib/gmail.ts`** (server-only) scans the last 12 months
  (`SCAN_MONTHS = 12`) for `has:attachment filename:pdf`, capped at 200
  messages, and writes lightweight `gmail_import_candidates` rows
  (idempotent upsert, re-scanning is safe) — it does **not** download
  attachment bytes at scan time. `downloadGmailAttachment` only runs at
  import time, per selected candidate.
- **Import** (`app/actions/gmail.ts` `importGmailCandidates`): downloads the
  attachment, calls `importDocumentFromBuffer` (`app/actions/documents.ts`,
  admin client — there's no browser `File` object for a Gmail-sourced
  attachment, so it skips the normal signed-upload flow and writes straight
  to Storage + `documents`), then lets the extraction webhook pick it up
  same as any other upload.
- **Outlook and the other stub rows in the Add document sheet are pure UI**
  — disabled, no route/action/table behind them. Don't build against them
  without checking first; they may still just be placeholders.

## Family, school and key dates (phase 7)

Unchanged in shape from earlier phases (`/family`, `app/actions/family.ts`,
`nextBirthday()`, `lib/coming-up.ts` merge). `household_people.relation` and
`schools.postcode` were added for the address-picker/people-list work — see
Database.

## School & household calendars (phase 7b / 7c)

- **School calendars**: unchanged mechanism (`lib/school-calendar.ts`,
  `lib/ics.ts` for the shared fetch/parse/pin, `syncSchoolCalendar`,
  `GET /api/cron/school-calendars`). New: `lib/school-year-match.ts` filters
  a feed's events against the household's own children's year groups (so
  "Y7 trip" doesn't show for a household with only a Y10 child), and the ICS
  cache now carries `description`/`url` for the detail sheet.
- **Household calendars** (new, 7c): the same read-mostly cache pattern one
  level up — a household links its own ICS feed(s) (a shared family
  calendar, a club's fixtures) via `lib/household-calendar.ts`
  (`syncHouseholdCalendar`), cached in `household_calendars` /
  `household_calendar_events`. `GET /api/cron/school-calendars` now
  refreshes **both** schools and household calendars in one interleaved,
  time-boxed run (still one route, not renamed).
- **Coming up / `/calendar`** merge both feeds alongside documents,
  birthdays, household events, timetable and routines. Tapping any
  calendar-shaped entry (dashboard or `/calendar`) opens
  `CalendarEventDetailSheet`.

## Family-life v2 — overnight build (12 Sept 2026)

Ross asked for this as a direct overnight build outside the phase table
(explicitly out of scope: budgets-as-product, social feed, kid location
tracking, custody weeks, visual rebrand). All four migrations from that
night are applied.

- **School timetable** (`/family` → `TimetablePanel`, `lib/timetable.ts` +
  `lib/timetable-extract.ts` + `app/actions/timetable.ts`) — per-child
  week grid. Slots can be typed manually or extracted from a photo/paste via
  Claude vision (`extractTimetableAction`, hard-fails with no fallback if
  `ANTHROPIC_API_KEY` is unset) into a **draft** the parent reviews before
  `replacePersonTimetable` writes it. `inferKitFlags(subject)` is a regex
  heuristic (PE/Games/swimming → kit; Food Tech/Cooking → ingredients) that
  seeds `bring_kit`/`bring_ingredients` — editable, not authoritative.
  Feeds Coming up the evening before / morning of via
  `timetableComingUpEntries`.
- **Household routines** (`RoutinesPanel`, `lib/routines.ts` +
  `app/actions/routines.ts`) — weekly/fortnightly/monthly recurring beats,
  expanded into Coming up by `routineComingUpEntries`.
- **Meal plan** (`MealsPanel`, `lib/meals.ts` + `app/actions/meals.ts`) —
  a light Mon–Sun list, title + free-text ingredients note per day, with a
  one-tap "add ingredients to list" hook into the household's first
  shopping list (creates one named "Shopping" if none exist).
- **Who's-where** (`lib/whos-where.ts` + `app/actions/whos-where.ts`,
  `WhosWhereSection` + `WhosWhereEditor`) — today's per-person status, tap
  to edit with suggestion chips ("At school", "WFH", …).
- **Maintenance clock** (`MaintenanceSection`) — explicitly a thin read of
  existing document renewal/end dates (`lib/home-overview.ts`
  `upcomingDates`, next 90 days), not a new data model.
- **Guests pack** (`app/(app)/settings/GuestPackPanel.tsx`, `lib/guests.ts` +
  `app/actions/guests.ts`) — 5 free-text columns on `households`. The wifi
  password field is a plain, unmasked text input.
- **Shared inbox** — the "Home inbox" category (see Property hub) plus a
  dashboard-era link into `/documents?category=Home%20inbox&upload=1#upload`.
- **Child view** — `components/ViewModeToggle.tsx`, `localStorage` key
  `homeapp.viewMode`, broadcasts a `window` custom event so consumers
  (`BottomTabBar`, `CreateFab`, `CreateSheet`) re-render. Explicitly **not**
  access control — the panel copy says so ("It's only on this device — not
  a lock"). `getServerSnapshot()` always returns `"adult"`, so SSR can't
  know the mode; the first paint on a device in child mode briefly shows
  adult chrome until hydration.

**Drift since shipping — read this before touching the dashboard.** These
five components still live under `app/(app)/dashboard/` by file path, but a
later rebrand commit (`ffdfa9a`, "Tighten Home to a Hartley briefing")
stripped Home down to just the hero + Coming up + house-file peek:

| Component | File lives in | Actually rendered from |
| --- | --- | --- |
| `WhosWhereSection` | `dashboard/` | `/family` only |
| `MaintenanceSection` | `dashboard/` | `/documents` only |
| `HelpfulHintsSection` | `dashboard/` | **nowhere — orphaned** |
| `ShoppingSection` | `dashboard/` | **nowhere — orphaned** |
| `FilingSection` | `dashboard/` | **nowhere — orphaned** |

The three orphaned ones are dead code as of this writing — they compile and
have no import anywhere in the app. Don't assume "Helpful hints" or a
"Shopping" line still appear on Home; they don't. Either delete them or
decide where they belong before building on top of them — check with Ross
rather than guessing, since the removal from Home looks deliberate
(a "Hartley-tight" hero-first Home) but nobody explicitly decided to kill
these three features outright.

## Home UI, navigation and the rebrand

- **Home (`/dashboard`)** is now: full-bleed map hero (`HomeMapUnderlay`,
  OSM/CARTO tiles via `/api/home-map`) with a frosted-glass greeting overlay
  (`ShellGreeting variant="overlay"`) and the household name/address on top
  of it, two navy/sage CTA tiles, `ComingUpSection` (limit 4), and
  `HouseFileSection` (`PropertyHub` in `peek` mode). That's the whole page —
  see the drift table above for what used to be here.
- **`ComingUpSection` → `ComingUpList` → `ComingUpTappableRow`** is a
  three-way split on purpose: `ComingUpSection` is the async server
  data-loader, `ComingUpList` is presentational (server component, groups by
  month), `ComingUpTappableRow` is the only client boundary (holds the
  open/closed state for `CalendarEventDetailSheet`). This split exists
  because `ComingUpList` originally imported `"server-only"` transitively
  through `lib/coming-up.ts` into a client component and broke the build
  (`bce48a1`) — don't re-merge these without re-checking that boundary.
  `/calendar`'s day list (`CalendarDayList.tsx`) does the same tap-to-open
  pattern with its own local state rather than reusing
  `ComingUpTappableRow` — harmless duplication, not a bug, since none of its
  imports are server-only.
- **Create sheet / FAB**: `CreateFab` (centre "+", every `(app)` tab except
  `/hub`) → `CreateSheet` (Document / Key date / Shopping list / Person,
  Document hidden in child view) → `BottomSheet` (the generic portal/swipe/
  Escape primitive also used by `CalendarEventDetailSheet` and
  `AddDocumentSheet`). Introduced alongside the bottom tab bar as
  complementary nav, not a replacement — the 5 tabs are unchanged.
- **Shell composition**: `app/(app)/layout.tsx` still calls
  `requireOnboarded()` once and renders one shared shell round `{children}`
  — the "one shared layout" architecture in "How a tab switch is kept
  quick" is intact. What changed is that layout now delegates *which* shell
  to `ShellRouter` (client, picks `HubShell` for `/hub*`, `AppShell`
  otherwise) instead of always rendering `AppShell` itself.
  `ShellGreeting`/`PreAppShell` were extracted out of `AppShell` for reuse
  (signed-in overlay vs. header, and signed-out screens respectively).
- **Home affordance drift**: `df4d4b9` added a wordmark link in the
  signed-in header specifically so every screen had a way back to Home. The
  later hero rewrite (`f17bea7`) removed the wordmark from the header
  entirely (there's no `Wordmark` reference left in `AppShell.tsx` or
  `ShellGreeting.tsx`). The only remaining explicit "back to Home" is the
  chevron link + "Done" button on `/settings` — the bottom tab bar's Home
  tab still works, of course, but the originally-stated rationale for that
  Settings link (pairing with a header wordmark) no longer matches what's
  in the header. Not broken, just worth knowing if you're asked to add a
  Home link somewhere and assume the wordmark still does that job.

## Hub / Lounge mode

- **`/hub`** — a signed-in, read-mostly display meant for a landscape iPad
  left running on a kitchen counter. Three columns: Today (kit/routines/
  dinner), Who's-where + Meals, Coming-up (school ICS + document renewals) —
  all server-composed by `lib/hub-data.ts` from the existing loaders
  (coming-up, family, meals, timetable, whos-where). Explicitly out of scope
  per `docs/hub-lounge-mode-sketch.md`: smart-home control, a photo
  carousel, trivia, timers, no-auth kiosk mode.
  - **Access**: `/hub` is in `proxy.ts`'s `PROTECTED_PREFIXES` and the page
    calls `requireOnboarded()` — same gate as every other tab, i.e. it is
    **not** a no-auth kiosk; whoever leaves the iPad signed in is trusting
    that device the same way they trust any other signed-in session.
  - **Chrome**: no bottom tab bar, no FAB, no sticky header — `HubShell`
    instead of `AppShell`, selected by `ShellRouter`. `HubClock` (client,
    Europe/London) and `HubRefresh` (client, `router.refresh()` every 60s)
    keep it current without a manual reload.
  - **Entry point**: a plain link in Settings (`HubDisplayLink`) — there is
    no separate onboarding for it, you just open `/hub` on the iPad while
    signed in as a household member.
  - **Native deep link**: `co.rodor.homeapp://hub`, for the iOS shell.

## iOS Capacitor shell + native auth

- **The native project is not in this repo.** `docs/ios-capacitor-kickoff.md`
  documents the "thin shell" pattern also used by the sibling Rodor product
  GraftMate: a separate repo (`rodor1155/ios-shell-template`, instance
  `instances/homeapp/`) wraps this app's **live deployed URL**
  (`https://homeapp-mu.vercel.app`) in a WKWebView. Bundle ID
  `co.rodor.homeapp`, URL scheme `co.rodor.homeapp://`. Most UI ships by
  deploying this repo to Vercel, not by rebuilding the native binary — a
  native rebuild is only needed for Info.plist, AppIcon, splash, plugins,
  device family, export compliance, or signing changes. Read
  `docs/ios-capacitor-kickoff.md` and, before a first App Store submit, the
  GraftMate ASC-lessons page linked from the homeapp Notion hub — it's a
  reusable playbook (privacy URL path, iPhone-only device family,
  screenshot requirements, the `reviewSubmissions` API flow, a Guideline
  2.1 info-request response kit) written specifically for Rodor product
  bots preparing this kind of submission. As of the last check-in, the
  homeapp submission itself was blocked on an App Store Connect Issuer ID —
  confirm current status in Notion rather than assuming that's still true.
- **Detecting the shell**: `lib/is-capacitor-native.ts` `isCapacitorNative()`
  checks `window.Capacitor.isNativePlatform?.()`, falling back to
  `getPlatform?.() === "ios"|"android"`. It deliberately does **not** treat
  the mere presence of `window.Capacitor.Plugins` as a signal — importing a
  Capacitor plugin registers a web fallback on that object even in an
  ordinary browser, since the shell loads the exact same JS bundle as the
  web app (`server.url` pattern, no separate native build of the UI).
- **Native Google sign-in** — plain in-WebView Google OAuth is unreliable on
  iOS (Google hands off to system Safari and errors). Instead:
  1. `lib/native-google-sign-in.ts` starts Supabase OAuth with
     `skipBrowserRedirect: true`, then opens the URL in the Capacitor
     **Browser** plugin (an in-app SFSafariViewController) rather than
     navigating the main WKWebView.
  2. `redirectTo` points at `app/auth/native-bridge/page.tsx` — an HTTPS
     page rendered inside that in-app browser which immediately
     `window.location.href`s to `co.rodor.homeapp://auth/callback` (custom
     URL scheme hand-off), with a ~1.5s same-tab fallback in case the OS
     doesn't hand off to the app.
  3. `components/NativeOAuthListener.tsx` (mounted app-wide) listens for the
     Capacitor `App` `appUrlOpen` deep link (plus `getLaunchUrl()` for cold
     starts), dedupes via `sessionStorage`, closes the in-app browser, and
     completes the session in the **main** WKWebView by navigating to the
     same-origin `/auth/callback` — so Supabase's session cookie ends up in
     the webview that actually serves the app, not the SFSafariViewController.
- **`lib/public-app-origin.ts`** prefers `NEXT_PUBLIC_SITE_URL` (when not
  localhost) over `window.location.origin`, because a Capacitor WebView's
  origin can be something like `capacitor://localhost` — without this,
  OAuth `redirectTo` values could point at a meaningless origin. The
  equivalent server-side hardening (`siteUrl()` in `app/actions/auth.ts`)
  prefers a non-localhost env var, then `VERCEL_URL`.
- **Auto-confirm signups**: `signUpWithPassword` in `app/actions/auth.ts`
  auto-confirms new email signups via `createAdminClient().auth.admin
  .updateUserById(..., { email_confirm: true })` — because Supabase's
  built-in mailer often doesn't deliver and custom Auth SMTP isn't wired for
  every environment. This does use the service-role key, but correctly
  through `lib/supabase-admin.ts` — no convention violation. It also now
  distinguishes an already-registered email (Supabase returns empty
  `identities` on a repeat signup) from a genuine new signup, so the error
  copy doesn't tell an existing user to "check your email" for nothing.

## Tab navigation cache

- **Tab Client Cache**: `experimental.staleTimes` (`dynamic` 120s, `static`
  300s with `prefetch={true}` on the tab bar). `PrefetchAppRoutes` warms
  every tab plus settings as soon as the shell mounts. Pull-to-refresh calls
  `router.refresh()` when fresh data is needed. Unchanged.

## Shopping lists (phase 8)

Unchanged mechanism (`app/actions/lists.ts`, `ItemsPanel` optimistic via
`useOptimistic`, `moveItem` same-group swap). Note: the dashboard's old
"one line naming up to three lists with something outstanding" no longer
renders — see the `ShoppingSection` row in the family-life-v2 drift table
above. `/lists` itself is unaffected; only the Home-page teaser is gone.

## How a tab switch is kept quick

- **`app/(app)/` is one shared layout for all five tabbed screens**, plus
  `/hub` sharing the same layout but a different inner shell — see "Home UI,
  navigation and the rebrand" above for the `ShellRouter` split. Moving
  between ordinary tabs still only re-renders the page below the shell.
- **`app/(app)/loading.tsx`** is unchanged — the Suspense fallback for the
  children slot.
- **`loadHouseholdContext()` is `cache()`d** — unchanged.
- **Pages fan out** — unchanged; every screen fires its independent reads in
  one `Promise.all`.

## Conventions

- Server-only modules import `server-only` at the top. A component that
  transitively imports something server-only through a shared lib and gets
  bundled client-side is a real, seen-in-this-repo failure mode
  (`bce48a1`) — if you add a field to a server-only type and a client
  component starts importing it just for the type, prefer a small
  structural type over the real one (see `lib/calendar-event-detail.ts`'s
  `ComingUpDetailSource`).
- Never reference `SUPABASE_SERVICE_ROLE_KEY` outside `lib/supabase-admin.ts`.
- Keep `.env*` out of git (already in `.gitignore`).
- New DDL goes through a migration file **and** is applied to the project;
  re-run the Supabase security advisor after DDL. (As of this writing every
  migration file in the repo is applied — keep it that way.)
- Upload flow: client asks `createUploadTarget` (server) for a signed URL,
  uploads straight to Storage with the browser client, then calls
  `recordDocument` (server) — **except** Gmail-imported documents, which
  already have the bytes server-side and go straight through
  `importDocumentFromBuffer` on the admin client instead.
- Household resolution in server actions is "the caller's oldest
  `household_members` row", hand-repeated across most `app/actions/*.ts`
  files (see Database section) — there's no shared helper for it.

## Environment variables

Local in `.env.local` (git-ignored, see `.env.example` for the authoritative,
maintained copy); mirror into Vercel (Production + Preview).

| Variable | Exposure | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | public | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | anon key for browser/server clients |
| `SUPABASE_SERVICE_ROLE_KEY` | **server-only, secret** | admin client; never expose to the browser, never commit |
| `NEXT_PUBLIC_SITE_URL` | public | base URL for auth redirect links; must equal the deployment origin |
| `ANTHROPIC_API_KEY` | **server-only, secret** | Claude vision — document extraction *and* timetable extraction |
| `EXTRACTION_WEBHOOK_SECRET` | **server-only, secret** | must equal the Vault secret `extraction_webhook_secret` |
| `INTERNAL_TOOLS_EMAILS` | server-only | optional CSV allow-list for `/internal/*`; unset = any signed-in user |
| `RESEND_API_KEY` | **server-only, secret** | reminder email; unset = sends are logged as skipped |
| `REMINDERS_FROM_EMAIL` | server-only | From: address for reminder email (domain verified in Resend) |
| `CRON_SECRET` | **server-only, secret** | bearer token for both cron routes; Vercel sends it automatically |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | **server-only, secret** | Gmail import OAuth — a **separate** Google Cloud client from Supabase Auth's Google sign-in; unset = the Add document sheet still works, Gmail shows a setup message |
| `STRIPE_SECRET_KEY` | **server-only, secret** | Stripe key; **unset = billing off**, gates inert, paid entitlements for everyone |
| `STRIPE_WEBHOOK_SECRET` | **server-only, secret** | signing secret for `/api/stripe/webhook`; unset = the webhook 200s and does nothing |
| `STRIPE_PRICE_GBP_MONTHLY` / `_YEARLY`, `STRIPE_PRICE_USD_MONTHLY` / `_YEARLY` | server-only | the four price IDs |
| `IDEAL_POSTCODES_API_KEY` | server-only | address picker on home/school forms; unset = falls back to free postcodes.io (validation only, no full address list) |
| `HOME_MAP_SIGNING_SECRET` | **server-only, secret** | HMAC for short-lived `/api/home-map` tokens — a dedicated secret, must **not** reuse `SUPABASE_SERVICE_ROLE_KEY`; unset = tokens aren't minted but the route still works for signed-in sessions |
| `CARTO_BASEMAPS_API_KEY` | server-only | CARTO Voyager map tiles for the home-map hero; unset = falls back to OSM tiles |

Every variable's purpose, default-unset behaviour, and setup steps are kept
current in `.env.example` — treat that file, not this table, as the
source of truth if they ever drift, and update both together.

## Verification harness

`scripts/verify-flows.mjs` runs invite-accept and delete-account checks
against the linked Supabase project using the service role. Requires
`.env.local`. Unchanged.

## Supabase config not captured in code (do this in the dashboard)

- **Auth → URL Configuration**: Site URL = prod origin; add
  `<NEXT_PUBLIC_SITE_URL>/auth/callback` for local + prod to the redirect allow-list.
- **Auth → Providers → Google**: this is the *sign-in* Google client, configured
  entirely in the Supabase dashboard — separate from the Gmail-import
  `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` app env vars (see Gmail section).
  Add `<SUPABASE_URL>/auth/v1/callback` as an authorized redirect URI in
  Google Cloud for this client.
- **Gmail import's Google Cloud client** (separate from the above): a Web
  application OAuth client with Gmail API enabled, redirect URIs
  `{SITE}/api/gmail/callback` for both local and prod.
- Built-in email is heavily rate-limited — add custom SMTP before real traffic.
- **Vault secrets** `extraction_webhook_url` + `extraction_webhook_secret`.
- Pre-existing security-advisor WARNs left alone: `public.rls_auto_enable()`
  and `pg_net` living in `public`. "Leaked password protection" is off.

## Assumptions changed from earlier phases

- Phase 1 CLAUDE.md said "no middleware". Next 16 replaced Middleware with
  Proxy; `proxy.ts` handles Supabase session refresh + the auth redirect
  (protected prefixes now also include `/calendar` and `/hub`).
- Onboarding gate = household has a `locale` **and** at least one property row.
- `/documents` now scopes its query by `property_id`.
- Model is pinned to `claude-sonnet-4-6` for extraction (documents *and*
  timetables) — `EXTRACTION_MODEL` in `lib/extraction.ts`.
- `/sign-in` + `/sign-up` take `?next=`, honoured only by the password flows.
- `/invite` is deliberately **not** in `proxy.ts`'s protected prefixes.
- **Every migration is applied as of this writing.** Earlier revisions of
  this file carried multiple "written but not applied" caveats (household
  people/schools/events, school calendars, shopping lists, documents
  category, household member emails, subscriptions) — all stale; verified
  directly against the live migration history, not inferred from Notion or
  the filesystem. Don't reintroduce that caveat pattern without checking.
- **The "seven categories" / "always all seven drawers" language from phase
  6/7 is stale** — there are eight now ("Home inbox" added), and
  `PropertyHub` has a `peek` variant that deliberately does *not* show all
  of them.
- **`HelpfulHintsSection`, `ShoppingSection` and `FilingSection` are
  currently dead code** (unreferenced anywhere) despite living in
  `app/(app)/dashboard/` — see the family-life-v2 drift table. Don't assume
  a file existing under `dashboard/` means it's rendered on the dashboard;
  check the actual import graph.
- **The signed-in header no longer carries a `Wordmark` link to Home** — the
  rationale behind the `/settings` "← Home" link (added to pair with that
  wordmark) has partly evaporated even though the link itself is still
  there and still works.
