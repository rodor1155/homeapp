@AGENTS.md

# homeapp — "Hearth Home"

A Next.js + Supabase app. This file records the plan and conventions so any
agent (or human) picking up the repo has the same context. The product is
being called **Hearth Home** in the UI (brand copy, emails, `lib/brand.ts`)
as of the mid-September rebrand; the working-name decision in Notion is
still formally open, so don't be surprised if it changes again — check
`lib/brand.ts` for the current live name rather than assuming this doc.

**On reconciling this file**: two waves of work landed on `main` roughly in
parallel without either seeing the other's documentation — one shipped
family-life v2 / Gmail import / Hub mode / iOS shell / the initial rebrand
and wrote it up; the other shipped household sharing / renewals / an
outbound ICS feed / a full light-dark theme rewrite / the Home card deck,
against the *older* doc, because the first update was sitting unmerged in a
PR. This revision merges both. If you find another gap like that, it means
a doc update didn't make it into `main` before the next wave started —
check for open, unmerged "update CLAUDE.md" PRs before assuming this file
is current.

## Plan

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Next.js App Router + TypeScript + Tailwind scaffold; three Supabase client helpers. | done |
| 2 | Auth (email/password, magic link, Google OAuth), household onboarding, document upload to Storage. | done |
| 3 | Document extraction worker — DB webhook → Claude vision → fields + confidence + chunked text; review/confirm UI; internal test harness. | done |
| 1b | Embeddings for `document_chunks` + retrieval (ask-your-home RAG). | not started |
| 3b | Mistral OCR fallback for `needs_review` long / poor-quality scans (after the 20-doc benchmark). | not started |
| 3c | Household invite-accept flow (`/invite` + three SECURITY DEFINER RPCs, email invites). | done, applied |
| 3d | Household sharing v2 — single-use link invites (`/join/[token]`), member colours, revocable kid view (`/kid/[token]`). | done, applied |
| 4 | Reminder engine — dates → `reminders` rows → daily cron → Resend email. | done, applied; Resend + `CRON_SECRET` wired on Vercel |
| 5 | Settings — household/property/locale editing, people + invites, sign out, account deletion. | done, applied |
| 6 | Billing — Stripe subscriptions, checkout + portal + webhook, export gate, plan card. | done, migration applied; confirm the four `STRIPE_PRICE_*` + `STRIPE_WEBHOOK_SECRET` are set before relying on it end-to-end |
| 7 | Home solution slice 1 — household people + schools + key dates, birthdays, property hub. | done, applied — **but see "Property hub" below: the hub is now orphaned, not "redesigned"** |
| 7b | School calendar (ICS) linking, per school — **inbound**. | done, applied |
| 7c | Household (shared) ICS calendars — **inbound**, a family Google calendar, a club's fixtures, cached the same way as a school's. | done, applied |
| 8 | Shopping lists — several lists per household, checklist items, tick/untick. | done, applied |
| 9 | Family-life v2 (overnight build, 12 Sept) — school timetable, household routines, meal plan, who's-where, maintenance clock, guests pack, shared inbox, device-local child view. | done, applied — see below |
| 10 | Gmail document import — read-only OAuth scan of the last 12 months for household PDFs, review-before-confirm. | done, applied |
| 11 | Hub / Lounge mode — read-mostly `/hub` display for a kitchen iPad. | done (no migration; composes existing loaders) |
| 12 | iOS via Capacitor — thin native shell in a **separate** repo (`ios-shell-template`), loads this app's live URL. | in progress — see iOS section; last known blocker was an App Store Connect Issuer ID |
| 13 | Rebrand to "Hearth Home" v1 — `AppMark`, deepened ink/navy/sage palette, map-forward hero. | done — superseded/extended by phase 16 |
| 14 | Renewals & deadlines — passports, licences, MOT, insurance, boiler service etc. tracked per person or per house; Coming up surfacing; a document's "Track renewal" offer. | done, applied — does not feed the email reminder engine yet |
| 15 | Household calendar subscribe feed — **outbound**, one ICS URL per household (key dates, renewals, document dates, birthdays) that a phone's own calendar app can subscribe to; `GET /api/ics/[token]`. | done, applied — **not the same feature as 7c**, see below |
| 16 | Theme system v2 + Home redesign — full light/dark via `prefers-color-scheme` (semantic CSS tokens, no in-app toggle), an evening map, the Home "card deck" (Coming up as a shuffleable stack), a weekend-only "Your week ahead" briefing. | done — replaced the phase-13 hero-and-list Home shape described in earlier revisions of this doc |

Every migration file under `supabase/migrations/` (31 as of this writing) is
applied to the linked project (`fybpmpnfocaxhqiwiyhs`) — verified directly
against the live migration history, not just the filesystem or an older
revision of this doc. **This doc has twice claimed migrations were "written
but not applied" when they were actually already live** — always re-check
`mcp__Supabase__list_migrations` (or the equivalent CLI) rather than
trusting a status line here, and don't reintroduce the caveat pattern
without checking. If you add a new migration, apply it immediately.

"Do not build the next phase's work until this table says so" is the
**default absent other instruction** — it exists so an autonomous agent
doesn't wander. It is not absolute: several phases above shipped because
Ross directly asked for work outside this table (an overnight build, a
sharing/renewals push), and the table was updated afterwards to match. A
direct, explicit ask from Ross overrides the table; guessing ahead on your
own initiative does not.

## Design system — "the household ledger", now theme-aware

One visual system, defined once, used by every screen.

- **Theme is system-driven only** — `prefers-color-scheme`, no in-app
  light/dark toggle anywhere. Light is the default. Every screen must work
  in both. `components/ViewModeToggle.tsx` is a *different* switch (adult
  vs. child chrome) — don't confuse the two.
- **Never hard-code a colour** — no hex/rgb/`bg-white`/`text-black` in a
  component. Use a semantic token or a legacy alias.
- **Tokens live in `app/globals.css`**: semantic CSS custom properties on
  `:root` (light defaults), overridden inside
  `@media (prefers-color-scheme: dark) { :root { … } }`, exposed to
  Tailwind via `@theme`. The older ledger palette (`paper`, `ink`, `rule`,
  `sage`, `ochre`, `oxblood`, `lilac`, `peach`, `sky`, …) now aliases these
  semantics rather than defining its own values, so existing utility
  classes keep working unchanged.
  - Core surface/text/border/accent: `--surface`/`paper`,
    `--surface-raised`/`paper-raised`, `--surface-sunk`/`paper-sunk`,
    `--text`/`ink`, `--text-muted`/`ink-soft`, `--text-faint`, `--border`,
    `--border-strong`, `--accent`/`amber`, `--accent-text`.
  - Glass chrome (map overlays, the tab bar, sheets): `--surface-glass`,
    `--surface-glass-strong`, `--surface-glass-card`,
    `--surface-glass-card-front`, `--surface-glass-peek-near/far`,
    `--surface-deck-control(-hover)`, `--deck-control-border`,
    `--glass-border`, `--glass-shadow`.
  - Home map: `--map-text(-muted|-subtle)`, `--map-ground(-2)`,
    `--map-scrim-top/bottom`, `--map-fallback-grid`, `--map-credit`,
    `--map-pin-icon-on`.
  - Tab bar: `--tabbar-bg`, `--tabbar-icon(-hover)`, `--tabbar-active`,
    `--tabbar-active-bg`, `--tabbar-shadow`.
  - Per-person: `--member-<key>` / `--member-<key>-soft`, one pair per
    entry in `lib/member-colours.ts`'s 8-colour palette (see Household
    sharing below).
  - Status hues (`sage`/`ochre`/`oxblood`) and "kind" pastels
    (`lilac`/`peach`/`sky`, plus `navy`) are a *separate* system in
    `lib/tones.ts` (`TONE_DOT`/`TONE_PILL`/`TONE_WASH` maps) — not part of
    the light/dark semantic set, don't conflate the two when picking a
    colour for something.
- **Home map + tab bar** both reflect the theme: `/api/home-map?style=light|dark`
  renders two cached PNGs; the client picks one purely in CSS
  (`<picture><source media="(prefers-color-scheme: dark)">…</picture>`,
  `EveningMapView.tsx`'s `MapLayer`) — no JS toggle, no reload. Root
  `layout.tsx`'s `viewport.themeColor` is theme-scoped
  (`{media: "(prefers-color-scheme: light)", color: "#FAF7F2"}` /
  the dark equivalent `#141C2E`).
- **Type**: **Fraunces** (wordmark) + **IBM Plex Sans** (body, `.tnum` for
  dates). Scale `--text-xs`…`--text-3xl` in `@theme`. Unchanged since the
  original design pass.
- **`components/AppMark.tsx`** — house-mark icon (sm/md/lg), the primary
  in-app brand mark; the header no longer carries a `Wordmark` link (see
  the Home UI section's drift note).
- **`lib/brand.ts`** — `APP_NAME` and `appTitle(page)`. Every page
  `<title>` should go through this, not a literal string.
- **Primitives** in `components/ui.tsx`: `LedgerPage`, `Wordmark`,
  `SectionHeading`, `Card`, `Button`, `Field`, `ConfidencePill`, `StatusMark`.
- `/internal/extraction-test` stays unstyled beyond base tokens.

## Stack

- Next.js 16 (App Router, Turbopack) + React 19
- TypeScript (strict), import alias `@/*` -> repo root
- Tailwind CSS v4 (`@tailwindcss/postcss`, `@import "tailwindcss"` in
  `app/globals.css`, with `tailwind.config.js` referenced via `@config`)
- ESLint flat config via `eslint-config-next`
- Supabase: `@supabase/ssr` (cookie-based sessions) + `@supabase/supabase-js`
- `node-ical` for **inbound** ICS calendar feeds (school + household,
  server-only; ships its own types) — the **outbound** subscribe feed
  (phase 15) is a from-scratch RFC 5545 writer, not node-ical
- `sharp` for the home-map tile stitch (`/api/home-map`) — a **declared**
  dependency, not left to Next's optional transitive copy
- `@capacitor/app` + `@capacitor/browser` — used only by
  `components/NativeOAuthListener.tsx` / `lib/native-google-sign-in.ts` to
  talk to the native shell when one is present; harmless web fallbacks when
  it isn't (see iOS section)
- Claude vision is called from two places: `lib/extraction.ts` (documents)
  and `lib/timetable-extract.ts` (school timetables) — both server-only,
  both pinned to `EXTRACTION_MODEL`

## Structure

```
proxy.ts        Session refresh + auth gate. Next 16 renamed Middleware -> Proxy;
                the file is proxy.ts, the export is `proxy`. Do NOT add middleware.ts.
                PROTECTED_PREFIXES: /calendar /dashboard /documents /family
                /hub /lists /settings /onboarding /internal. Deliberately NOT
                protected: /invite, /join/*, /kid/*, /account-deletion,
                /account-deleted — these must render for a signed-out visitor.
app/
  page.tsx              routes to /sign-in, /invite, /onboarding, or /dashboard
  sign-in/, sign-up/    AuthPanel (client) — password + magic link + Google
  auth/callback/        PKCE code exchange (magic link, OAuth, email confirm); honours `?next=`
  auth/native-bridge/   HTTPS hand-off page for native Google sign-in (see iOS)
  auth/sign-out/        POST route handler
  onboarding/           3-step wizard (locale -> property -> partner invite)
  privacy/               public privacy policy (App Store requirement)
  account-deletion/       public, indexable instructions for deleting an account
  account-deleted/        public confirmation page after deletion completes
  join/[token]/            link-invite landing + join confirm; public, robots noindex
  kid/[token]/             read-only kid schedule page; public, robots noindex, no app chrome
  (app)/                the signed-in tabs. A route group, so the URLs are unchanged.
    layout.tsx          requireOnboarded() once + <ShellRouter> round `{children}`
    loading.tsx          the skeleton a tab shows between the tap and the page
    dashboard/           Home — now just fetches context + the `?week=` param and
                         renders <EveningMapHome>; see "Home UI, theme and the card deck"
    documents/            list + Add document sheet (camera/file/Gmail) + per-doc
                         extraction review/confirm + renewal "Track renewal" offer +
                         MaintenanceSection; reads `?category=` and `?upload=1`
    family/               who lives here + schools + key dates + timetable + routines +
                         meals + who's-where + renewals + kid-view links (see below)
    calendar/              month grid + tappable day list, birthdays/events/school
                         feeds/shared feeds merged, `?ym=`, `?day=`, `?event=`
    lists/                 the shopping lists (ListsPanel) + `[listId]/` (ItemsPanel)
    settings/               household/property/locale, plan, people/invites, guest
                         pack, calendar subscribe feed (CalendarFeedPanel), account
                         (download + delete), Hub display link
    hub/                    read-mostly kitchen-iPad display — its own chrome
                         (HubShell, not AppShell), see Hub section
  invite/                 pending EMAIL invites, accept/decline; works signed out
  internal/extraction-test/     benchmark harness — NOT linked from any nav
  api/extraction/          POST route the Supabase DB webhook calls (nodejs, maxDuration 60)
  api/stripe/               checkout/ + portal/ + webhook/ POST routes (nodejs)
  api/gmail/                connect/ (starts OAuth) + callback/ (exchange + redirect)
  api/home-map/             signed, cached OSM/CARTO tile stitch, `?style=light|dark`
  api/ics/[token]/          GET/HEAD public **outbound** household ICS subscribe feed
                         (token secret, nodejs) — see phase 15
  api/address-lookup/       Ideal Postcodes (fallback postcodes.io) address picker
  api/cron/reminders/       daily reminder send
  api/cron/school-calendars/  daily **inbound** ICS refresh (schools + household calendars)
  actions/                  auth.ts, onboarding.ts, documents.ts, invites.ts,
                           invite-links.ts, kid-links.ts, extraction-test.ts,
                           settings.ts, account.ts, family.ts, lists.ts, gmail.ts,
                           guests.ts, meals.ts, routines.ts, timetable.ts,
                           whos-where.ts, calendar-feed.ts, renewals (see lib/renewals.ts)
components/
  ui.tsx                   design primitives
  AuthPanel.tsx, SignOutButton.tsx
  AppMark.tsx               brand mark (see Design system)
  ShellRouter.tsx           client: picks AppShell vs HubShell by pathname
  AppShell.tsx               signed-in chrome: sticky header (ShellGreeting) +
                           <main> + CreateFab + BottomTabBar (now a floating glass
                           pill, theme-aware). Rendered once by ShellRouter/layout.tsx.
  ShellGreeting.tsx          greeting/settings-link/avatar, "header" and "overlay" variants
  PreAppShell.tsx           shared chrome for signed-out screens (mark + wordmark)
  BottomTabBar.tsx           5 tabs: Home / Family / Calendar / Lists / Documents;
                           Documents hidden in child view mode
  CreateFab.tsx + CreateSheet.tsx   centre "+" on every (app) tab (not /hub) ->
                           bottom sheet: Document / Key date / Shopping list / Person
  BottomSheet.tsx            generic reusable sheet primitive — used by CreateSheet,
                           CalendarEventDetailSheet, AddDocumentSheet, EveningComingUpSheet
  CalendarEventDetailSheet.tsx   the shared "detail" UI for a tapped calendar/Coming-up
                           item — opened from `/calendar?...&event=...` and reused by
                           the Home card deck rather than duplicated
  PropertyHub.tsx             "the house file" drawer grid — **currently dead code, see
                           the Property hub section: not rendered from Home OR /documents**
  category-icons.ts           icon + short label + CATEGORY_TONE per category
  NativeOAuthListener.tsx     app-wide: Capacitor deep-link listener for native
                           Google sign-in hand-off (see iOS section)
  ViewModeToggle.tsx           adult/child mode, localStorage only, device-local,
                           not an access control — a *different* thing from the
                           theme's light/dark or the kid-view secret link
  HubShell.tsx, HubClock.tsx, HubDisplayLink.tsx, HubRefresh.tsx   /hub chrome
lib/
  categories.ts             client-safe CATEGORIES — **8**, incl. "Home inbox" —
                           categorise() / effectiveCategory()
  supabase-client.ts, supabase-server.ts, supabase-admin.ts, supabase.ts
  household.ts               server-only: loadHouseholdContext (cache()d) /
                           requireOnboarded / queryActiveMembership — active household
                           is the caller's **most recently joined** membership (not
                           "oldest" — that changed with link-invite sharing)
  extraction.ts               server-only: document extraction (Claude vision)
  timetable-extract.ts        server-only: school-timetable extraction (Claude
                           vision, separate from documents — doesn't touch the DB)
  document-types.ts           client-safe row/confidence shapes
  invites.ts, members.ts       EMAIL invites (legacy onboarding path)
  invite-links.ts             client-safe: InviteLinkPreview / PendingInviteLink
                           shapes + loaders for the phase-3d **link** invites
  billing.ts                  server-only Stripe entitlements/checkout/portal helpers
  account-deletion.ts          server-only: loadAccountDeletionPreview /
                           deleteAccountForUser — see Settings + account deletion
  property.ts                 PROPERTY_TYPES picklist
  family.ts                   client-safe: HouseholdPerson / School / HouseholdEvent /
                           SchoolCalendarEvent shapes + arithmetic
  member-colours.ts            client-safe: 8-colour palette, personColour /
                           nextFreeColour / memberEdgeClass — chips, deck tints,
                           avatars, calendar dots, renewal group headers
  evening-map.ts               client-safe: evening Home briefing helpers +
                           cardTintForEntry(); re-exports member-colours helpers
  week-ahead.ts                client-safe: isWeekAheadWindow() / buildWeekAhead() —
                           the weekend-only "Your week ahead" briefing model
  household-calendar.ts       server-only: sync a household's own **inbound** ICS
                           feed (phase 7c — same shape as school-calendar.ts)
  school-calendar.ts           server-only: sync a school's **inbound** ICS feed
  ics.ts                       shared **inbound** fetch/parse/pin used by both syncs
  ics-export.ts                 pure RFC 5545 builder for the **outbound** household
                           subscribe feed (phase 15) — no server-only import by design
  ics-feed-load.ts              server-only: loads household rows on the admin
                           client and calls the ics-export builder for GET /api/ics/[token]
  renewals.ts                   client-safe: renewal_items shapes, RENEWAL_KINDS,
                           load/save helpers for phase-14 renewals & deadlines
  timetable.ts                 client-safe: person_timetable_slots load +
                           Coming-up/calendar expansion + kit-flag inference
  school-year-match.ts          pure: match a school ICS event's title (e.g.
                           "Y7 trip") against a household's children's year groups
  routines.ts                   client-safe: household_routines load +
                           weekly/fortnightly/monthly Coming-up expansion
  meals.ts                      client-safe: household_meal_plans (Mon-Sun) load
  whos-where.ts                  client-safe: person_day_status load, status suggestions
  guests.ts                      client-safe: guest-pack (5 columns on households)
  gmail-config.ts, gmail.ts     server-only: Gmail OAuth + scan + candidates
  kid-view-load.ts               server-only (admin client): resolve a /kid/[token]
                           into that child's next-6-days schedule
  is-capacitor-native.ts        client: detect the Capacitor iOS shell at runtime
  native-oauth.ts, native-google-sign-in.ts, public-app-origin.ts   iOS OAuth plumbing
  hub-data.ts                    server-only: composes existing loaders for /hub
  calendar-event-detail.ts        client-safe: map a calendar item / Coming-up
                           entry to a tappable detail-sheet payload
  calendar-month.ts               month-grid + day-list shaping, incl. school-year filter
  coming-up.ts                    server-only: the one merged dated list — documents,
                           birthdays, household events, school + household **inbound**
                           calendar feeds, timetable, routines, renewals. Also owns
                           `comingUpHref(entry)`, the single place that decides where
                           tapping any entry navigates to.
  tones.ts                        status-hue / kind-pastel <-> pill/dot class mapping
  html-entities.ts                 decode ICS text entities
  safe-path.ts                     safeNextPath()
supabase/migrations/   applied to the linked project (ref fybpmpnfocaxhqiwiyhs) —
                       all 31 files, verified against the live migration history
docs/
  ios-capacitor-kickoff.md      the iOS shell plan/status (shell lives in a
                               separate repo — see iOS section)
  hub-lounge-mode-sketch.md      the /hub spec (three-column kitchen display)
```

## Database (all in `supabase/migrations/`, all applied to `fybpmpnfocaxhqiwiyhs`)

- `households(id, name, locale check UK|US, created_at, wifi_name, wifi_password,
  spare_key_note, bin_day_note, school_run_note)` — the last five columns are the
  guest pack (settings-only form, `lib/guests.ts` / `app/actions/guests.ts`);
  `wifi_password` is stored and rendered as plain text, not masked.
- `household_members(household_id, user_id, role, created_at, pk(household_id,user_id))` —
  emails come from `public.household_member_emails(uuid)` (SECURITY DEFINER).
  **`private.transfer_household_ownership()`** (trigger, AFTER DELETE on this
  table) promotes the member with the earliest `created_at` (tie-broken by
  `user_id`) to owner when the departing member was the owner and others
  remain — real and applied, not a stub.
- `properties(id, household_id, address, type, year_built, created_at)`
- `household_people(id, household_id, user_id null → auth.users on delete **set null**,
  name, kind check adult|child|other, relation null check (wife|husband|partner|
  mother|father|daughter|son|sister|brother|grandmother|grandfather|guardian|other),
  birthday date null, school_id null → schools, year_group null, notes null,
  colour null check (one of an 8-key palette — see `lib/member-colours.ts`),
  sort_order, created_at)` — `colour` is picked in the Family form and defaults
  to the first unused palette colour on insert (`nextFreeColour()`); `relation`
  is a soft-checked free label, blank/unknown cleared in the app rather than
  DB-rejected. `on delete set null` on `user_id` is what lets account deletion
  leave a shared household's people rows intact (see Settings section).
- `schools(id, household_id, name, address null, postcode null, notes null,
  created_at, calendar_url null, calendar_title null, calendar_last_synced_at
  null, calendar_last_error null)` — `schools_household_name_unique` backs the
  app-level de-dup in `findOrCreateSchool`.
- `school_calendar_events(..., description text null, url text null)` — the
  **inbound** ICS cache for a school's feed, today → +120 days, dropped and
  rebuilt on every sync. `description`/`url` feed `CalendarEventDetailSheet`.
- `household_calendars(id, household_id, name, calendar_url null, calendar_title
  null, calendar_last_synced_at null, calendar_last_error null, created_at)` +
  `household_calendar_events(..., calendar_id, description text null, url text
  null, unique(calendar_id, uid))` — **inbound**: the household's own shared ICS
  feeds (a family Google calendar, a club's fixtures), same read-mostly cache
  shape as a school's. `lib/household-calendar.ts` is the sync surface. **Not
  the same table as `household_calendar_feeds` below** — read the names
  carefully, they're inverse features.
- `household_events(id, household_id, title, event_date, event_type check
  birthday|school|home|other, person_id null, school_id null, notes null,
  created_at)` — dates someone typed in. Birthdays are never mirrored here —
  derived from `household_people.birthday`.
- `person_timetable_slots(id, household_id, person_id → household_people, weekday
  0-6, start_time/end_time text HH:MM, period_label, subject not null, location,
  bring_kit bool, kit_label, bring_ingredients bool, ingredients_note, notes,
  source_document_id null → documents, sort_order, created_at)` — a child's
  school-week timetable; insert/update also require the person to belong to the
  caller's household. `source_document_id` exists at the schema level but
  nothing currently sets it.
- `household_routines(id, household_id, title, cadence check weekly|fortnightly|
  monthly, weekday 0-6 null, day_of_month 1-28 null, anchor_date date null,
  notes, active bool default true, sort_order)` — recurring household beats
  (bin night, library books).
- `household_meal_plans(id, household_id, week_start date (Monday, Europe/
  London), weekday 0-6, title not null, ingredients_note, sort_order,
  unique(household_id, week_start, weekday))` — one row per weekday per week;
  the shopping-list hook (`addMealIngredientsToList`) naively splits the note
  on `\n , ;` — a one-tap manual action, not automatic on save.
- `person_day_status(id, household_id, person_id → household_people, status_date
  date, status_text not null, updated_at, unique(person_id, status_date))` —
  "who's where today"; same person-belongs-to-household RLS shape as timetable
  slots.
- `renewal_items(id, household_id, person_id null → household_people, title,
  kind check passport|driving_licence|ghic|car_mot|car_tax|car_insurance|
  home_insurance|boiler_service|tv_licence|other, due_date date (null only when
  status = dismissed), repeat_unit check none|month|year, repeat_every
  smallint, remind_days smallint, reference, provider, cost numeric(10,2),
  notes, document_id null → documents on delete set null, source check
  manual|suggestion|document, status check active|done|dismissed, last_done_at,
  created_at, updated_at)` — tracked renewals per person or for the house
  (`person_id` null). A partial unique index on
  `(household_id, coalesce(person_id, zero uuid), kind) where status = 'dismissed'`
  stops duplicate dismissed suggestions. Surfaced in Coming up inside each
  item's remind window and offered from a document's review form ("Track
  renewal"). **Does not write `reminders` rows or send email** — confirmed
  `lib/reminders.ts` has zero references to `renewal_items`; that engine
  stays document-only for now.
- `household_calendar_feeds(household_id pk → households, token text unique not
  null check length ≥ 32, created_at, rotated_at, created_by → auth.users)` —
  **outbound**: one ICS subscribe URL per household, for the household's own
  phone/calendar app to subscribe to. The token lives here rather than on
  `households` so it never rides along with `select *`. Members read/write to
  show/copy/regenerate/revoke; `GET /api/ics/[token]` looks the row up on the
  service role with no session. Regenerate replaces the token (old URL 404s).
  The generated feed includes `household_events`, active `renewal_items` with
  due dates (VALARM when `remind_days > 0`), document `renewal_date`/`end_date`
  (skipping superseded documents and ones with a linked active renewal, so a
  date isn't double-counted), and recurring birthdays (RRULE) from
  `household_people` — it deliberately **excludes** school/household inbound
  calendars, routines, timetable slots and reminder rows. `lib/ics-export.ts`
  is the pure builder (genuinely no `server-only` import); `lib/ics-feed-load.ts`
  is the server-only loader that feeds it.
- `person_kid_links(person_id pk → household_people on delete cascade,
  household_id → households on delete cascade, token text unique not null
  check length ≥ 32, created_at, rotated_at, created_by → auth.users)` — one
  secret read-only URL per child, **no expiry** (unlike the invite link
  below). Insert/update require the person to be `kind = 'child'` in the same
  household. `GET /kid/[token]` resolves on the service role with no session,
  is `robots: noindex` (plus `X-Robots-Tag: noindex` + `Referrer-Policy:
  no-referrer` set in `next.config.ts`) and rate-limited (60 requests/60s).
  Exposes only that child's own next-6-days schedule: timetable slots (incl.
  kit/ingredients), key dates linked to them, their school's cached inbound
  ICS dates, who's-where status, birthday countdown — never documents,
  renewals, routines, meals, other people or notes.
- `household_invites(id, household_id, email null, token text unique null,
  expires_at, invited_by, accepted_by, accepted_at, status, created_at)` —
  email rows from onboarding/legacy settings; **link** rows (phase 3d) carry a
  single-use `token` (≥32 bytes, base64url) and a 7-day `expires_at`, capped at
  10 outstanding per household. A row must have `email` or `token` set.
  Email invitees reach their row through `public.pending_invites_for_me()` /
  `accept_household_invite(uuid)` / `decline_household_invite(uuid)`. Link
  invites go through `public.invite_link_preview(p_token)` (readable signed
  out, for the `/join/[token]` preview) and
  `public.accept_household_invite_link(p_token)` (authenticated only).
  Accepting either kind inserts `household_members` (role `member`) and, if
  the joiner's own signup household is genuinely empty (checked via
  `private.household_is_empty` across every table this doc lists, not just
  membership), drops that membership so a fresh signup doesn't accumulate
  orphaned households — but a joiner who's already put content into their own
  household keeps both. **The "active" household anywhere in the app is the
  caller's most recently joined membership**, not the oldest — this changed
  with sharing; `queryActiveMembership()` / `loadHouseholdContext()` in
  `lib/household.ts` is the one place that decides it.
- `documents(...)` — upload lands `extraction_status = 'pending'`; the worker
  fills the extraction fields + `extraction_confidence` jsonb. `category` is
  one of **8** values including `"Home inbox"` (see Property hub). Status
  flow: `pending → processing → extracted | needs_review | failed → confirmed`.
- `gmail_connections` / `gmail_import_candidates` — see Gmail document import
  below; unchanged by the later waves of work.
- `document_chunks(id, document_id, chunk_index, content)` — no embeddings yet
  (phase 1b).
- `reminder_rules`, `reminders`, `reminder_events` — unchanged from phase 4.
  Still document-only; renewals and the outbound ICS feed are read paths, not
  writers, into this system.
- `subscriptions(household_id pk → households, stripe_customer_id,
  stripe_subscription_id, status default 'none', plan, current_period_end,
  cancel_at_period_end, updated_at)` — migration applied; confirm
  `STRIPE_WEBHOOK_SECRET` and the four `STRIPE_PRICE_*` vars are actually set
  in a given environment before assuming checkout/webhook work end-to-end.
- Private Storage bucket `documents`, key pattern `<household_id>/<document_id>/<filename>`

RLS model unchanged: every table (and the bucket) is gated on
`private.is_household_member(household_id)`. Household resolution in most
server actions is still hand-repeated per file (`family.ts`, `settings.ts`,
`lists.ts`, `gmail.ts`, `guests.ts`, `meals.ts`, `routines.ts`, `timetable.ts`,
`whos-where.ts`) rather than centralised — and as of sharing v2 it must
resolve the **active** (most recently joined) membership, not just "the
caller's household", so double-check any of these files you touch actually
calls through `queryActiveMembership`/`loadHouseholdContext` rather than a
stale "first membership row" pattern from before sharing existed.

## Extraction worker (phase 3)

- **Trigger**: `documents_extraction_webhook` (after insert on `public.documents`)
  → `net.http_post` to the URL in Vault secret `extraction_webhook_url`, with
  `x-webhook-secret` from Vault secret `extraction_webhook_secret`. Fires only
  for `extraction_status = 'pending'`.
- **Route** `POST /api/extraction`: constant-time-compares `x-webhook-secret`
  against `EXTRACTION_WEBHOOK_SECRET`, then `runExtractionForDocument(record.id)`.
  Gmail-imported documents go through this **same** path — `importGmailCandidates`
  inserts a `pending` `documents` row directly (via `importDocumentFromBuffer`,
  admin client) and lets the DB webhook pick it up.
- **`extractDocument()`**: `claude-sonnet-4-6` (`EXTRACTION_MODEL`) vision,
  forced tool call. PDFs > 8 pages or files > 20 MB are parked as
  `needs_review` without calling Claude. Status flow:
  `pending → processing → extracted | needs_review | failed → confirmed`.
- **Review UI**: `/documents` — the Add document sheet feeds it manual uploads
  and confirmed Gmail imports alike; a confirmed document can also be offered
  as a "Track renewal" (phase 14).
- **`/internal/extraction-test`**: unchanged, gated to `INTERNAL_TOOLS_EMAILS`.

## Reminder engine (phase 4)

Unchanged from earlier phases — see `lib/reminders.ts`, `lib/email.ts`,
`GET /api/cron/reminders`. Still only covers documents; nothing emails a
birthday, a timetable kit reminder, a routine, or a renewal deadline — those
only ever show on Coming up / the calendar / the Hub display / the
household's own outbound ICS feed (if they've subscribed their phone to it).

## Settings + account deletion (phase 5)

- **`/settings`** cards: "Your household", "Plan", "People", **"Calendar
  subscribe feed"** (`CalendarFeedPanel`, phase 15), "Guest pack", a link to
  the Hub display, and **"Account"** (download + delete, replacing the
  separate old "Sign out"/"Delete account" cards).
- **`lib/account-deletion.ts`** (server-only, admin client) is now the whole
  deletion surface: `loadAccountDeletionPreview(userId)` and
  `deleteAccountForUser(userId): Promise<DeletionReport>`. Verified order of
  operations: (1) resolve sole-member vs. shared households; (2) **cancel any
  live Stripe subscription** on a sole-member household (aborts the whole
  deletion if billing looks configured-and-active but the cancel call fails —
  never silently leaves someone paying for a deleted account); (3)
  best-effort revoke + delete `gmail_connections` rows; (4) recursively purge
  every Storage object under each sole-member household's `<household_id>/`
  prefix (aborts before the user is deleted if purge fails); (5)
  `auth.admin.deleteUser()`; (6) post-check that memberships and sole
  households are actually gone. **Shared households are left alone** — the
  household, its subscription and its documents survive, and
  `household_people.user_id` is `SET NULL` by the FK rather than the person
  row being deleted, so a shared household doesn't lose "who lives here"
  entries just because one account left.
- **`private.transfer_household_ownership()`** (see Database) means a
  household an owner leaves, that still has other members, gets a new owner
  automatically rather than being ownerless.
- **`app/actions/account.ts`** — `deleteAccount(confirmText)` requires
  `DELETE`, calls `deleteAccountForUser()`, then signs out and redirects to
  `/account-deleted`.
- **`/account-deletion`** (public, indexable — linked from `/privacy` and
  sign-in, an App Store requirement) and **`/account-deleted`** (public
  confirmation) are both outside `proxy.ts`'s protected prefixes.

## Household sharing (phase 3d)

Link invites let a household owner add a partner or another adult without
relying on email delivery; the older email-invite path (`/invite`) still
works alongside it.

- **Link invites**: `InviteSomeoneSheet` (reachable from Family and Settings
  → People) creates a single-use link — 32-byte base64url token, 7-day
  expiry, capped at 10 outstanding per household (`app/actions/invite-links.ts`).
  Share via `navigator.share` when available, always with a copy fallback.
- **`/join/[token]`** (public, `robots: noindex`): renders
  `invite_link_preview`. Unknown token → 404; expired/used/revoked → a
  friendly card, not an error; signed out → household name + inviter with
  Create account / Sign in carrying `?next=/join/<token>` (validated by
  `safeNextPath`, honoured all the way through `/auth/callback` for
  password, magic link, OAuth and email-confirm); signed in → confirm + Join
  or Not now; already a member → straight to Home (the invite is never
  "consumed" by someone who doesn't need it).
- **Member colours**: `household_people.colour`, picked in the Family form
  (`nextFreeColour()` on insert if none posted). Tints who's-where chips, the
  Home deck cards, Coming up rows, person-linked calendar items and renewal
  group headers — the token pairs are `--member-<key>` / `--member-<key>-soft`
  (see Design system).
- **Kid view**: `KidViewLinkPanel` on Family → People, shown when editing a
  child — create/copy/share/open/regenerate/turn-off a link. `/kid/[token]`
  is a standalone, no-app-chrome page (large friendly type, today's items in
  time order, the next six days as simpler cards, auto-refreshes every 15
  minutes) — see the `person_kid_links` row in Database for the exact scope
  and hardening (noindex, no-referrer, rate limit).
- Neither `/join/*` nor `/kid/*` is in `proxy.ts`'s protected prefixes — both
  have to render for a signed-out visitor by design.

## Billing (phase 6)

Unchanged in mechanism from earlier phases (`lib/billing.ts`, the three
Stripe routes, `ExportButton`, `PlanPanel`). The `subscriptions` migration
is applied; before relying on checkout/webhook working end-to-end in a
given environment, confirm `STRIPE_WEBHOOK_SECRET` and the four
`STRIPE_PRICE_*` vars are actually set there. Account deletion (phase 5,
above) now cancels a household's subscription as part of leaving — that's
new since the original billing write-up.

## Property hub + filing categories

- **`lib/categories.ts`** lists **eight** `CATEGORIES` (seven original plus
  "Home inbox" for school letters / permission slips / correspondence).
  `categorise()` / `effectiveCategory()` unchanged in shape.
- **`components/PropertyHub.tsx` and its wrapper `HouseFileSection.tsx` are
  currently dead code.** They were the "house file" drawer grid described in
  every earlier phase-7 write-up of this doc, and at one point were still
  reachable from the dashboard in `peek` mode — but the Home redesign
  (phase 16, the card-deck rewrite) dropped that call, and `/documents`
  never picked it up either (confirmed: `git grep PropertyHub` on the current
  `main` finds only the component's own definition and its import inside
  `HouseFileSection.tsx`, which itself has no importers anywhere in the
  app). **There is currently no drawer-grid "house file" view anywhere in
  the product.** Don't assume it still exists because the file is in the
  tree; either wire it back in somewhere (`/documents` is the obvious home)
  or remove it — check with Ross rather than guessing, since the drop looks
  like an accidental casualty of the Home rewrite rather than a deliberate
  product decision.
- **`/documents`** still reads `?category=`/`?upload=1` and filters through
  `effectiveCategory()`, independent of the PropertyHub question above — the
  category system itself is alive and well, just not visualised as a drawer
  grid anywhere right now.

## Gmail document import

- **Add document sheet** (`app/(app)/documents/AddDocumentSheet.tsx`) has
  three steps: `add` (Connect Gmail / Connect Outlook [disabled stub] / Take
  photo / Browse files / Upload from cloud storage [stub] / Share from other
  apps [stub] / Email to Hearth Home [stub]) → `gmail-explain` → `gmail-review`
  (tick candidates, pick a category per row; **nothing is stored until
  "Import N documents" is pressed**).
- **OAuth**: `GET /api/gmail/connect` (CSRF `state` in an httpOnly cookie,
  10-min TTL) → `GET /api/gmail/callback`. Scope is **`gmail.readonly`
  only**. `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are a **separate**
  Google Cloud OAuth client from the one Supabase Auth uses for "Continue
  with Google" sign-in.
- **`lib/gmail.ts`** (server-only) scans the last 12 months
  (`SCAN_MONTHS = 12`) for `has:attachment filename:pdf`, capped at 200
  messages, writes lightweight `gmail_import_candidates` rows only —
  attachment bytes are downloaded only at import time, per selected
  candidate.
- **Import** (`app/actions/gmail.ts`): downloads the attachment, calls
  `importDocumentFromBuffer` (admin client — no browser `File` object exists
  for a Gmail-sourced attachment), then lets the extraction webhook pick it
  up same as any other upload.
- **Outlook and the other stub rows are pure UI** — no route/action/table
  behind them; confirmed still true on the current `main`.
- This whole feature is untouched by the later sharing/renewals/theme wave —
  confirmed present and still wired (`@/lib/gmail` imported from 4 files).

## Family, school and key dates (phase 7)

Unchanged in shape (`/family`, `app/actions/family.ts`, `nextBirthday()`,
`lib/coming-up.ts` merge). `household_people.relation` and `.colour` and
`schools.postcode` were added across two different waves of work — see
Database. `/family` now also surfaces renewals and kid-view link management
per person (phases 14 and 3d).

## School & household calendars — inbound (phase 7b / 7c)

- **School calendars**: unchanged mechanism (`lib/school-calendar.ts`,
  `lib/ics.ts` for the shared fetch/parse/pin, `syncSchoolCalendar`,
  `GET /api/cron/school-calendars`). `lib/school-year-match.ts` filters a
  feed's events against the household's children's year groups. The ICS
  cache carries `description`/`url` for the detail sheet.
- **Household calendars** (7c): the same read-mostly cache pattern one level
  up — a household links its own **inbound** ICS feed(s) via
  `lib/household-calendar.ts`, cached in `household_calendars` /
  `household_calendar_events`. `GET /api/cron/school-calendars` refreshes
  both schools and household calendars in one interleaved, time-boxed run.
- **This is the inverse of phase 15** (the outbound subscribe feed) — 7c
  brings *other people's* calendars in; 15 sends *this household's own*
  dates out. Don't conflate `household_calendars` (7c, inbound) with
  `household_calendar_feeds` (15, outbound) — similar names, opposite data
  flow, added roughly two weeks apart by different work.
- **Coming up / `/calendar`** merge every feed alongside documents,
  birthdays, household events, timetable, routines and renewals. Tapping any
  entry opens `CalendarEventDetailSheet` via the single `comingUpHref()`
  router in `lib/coming-up.ts`.

## Household calendar subscribe feed — outbound (phase 15)

The household's own dated data, exported as one ICS URL a phone or desktop
calendar app can subscribe to — see the `household_calendar_feeds` row in
Database for exactly what it includes/excludes and `lib/ics-export.ts` /
`lib/ics-feed-load.ts` for the implementation. Managed from Settings via
`CalendarFeedPanel` (create/copy/regenerate/revoke). Nothing about this
touches the reminder-email engine or the inbound feeds above.

## Renewals & deadlines (phase 14)

Tracked expiry-style dates — passports, driving licences, GHIC, MOT, car
tax/insurance, home insurance, boiler service, TV licence, or a free-text
"other" — attached to a person or to the house itself (`person_id` null).
See the `renewal_items` row in Database for the full shape. Surfaced on
Coming up inside each item's own remind window, and offered as a "Track
renewal" action from a confirmed document (`app/(app)/documents/DocumentsList.tsx`,
`components/RenewalEditSheet.tsx`). **Does not feed the email reminder
engine** — that stays document-only; a tracked renewal only ever shows up
on Coming up, the calendar, and (if due-dated) the outbound ICS feed.

## Family-life v2 — overnight build (12 Sept 2026)

Ross asked for this as a direct overnight build outside the phase table.
All migrations from that night are applied.

- **School timetable** (`/family` → `TimetablePanel`, `lib/timetable.ts` +
  `lib/timetable-extract.ts` + `app/actions/timetable.ts`) — per-child week
  grid, typed manually or extracted from a photo/paste via Claude vision
  into a **draft** the parent reviews before it's written.
  `inferKitFlags(subject)` is a regex heuristic seeding `bring_kit`/
  `bring_ingredients` — editable, not authoritative. Feeds Coming up the
  evening before / morning of.
- **Household routines** (`RoutinesPanel`, `lib/routines.ts`) —
  weekly/fortnightly/monthly recurring beats, expanded into Coming up.
- **Meal plan** (`MealsPanel`, `lib/meals.ts`) — a light Mon–Sun list with a
  one-tap "add ingredients to list" hook into the household's first shopping
  list.
- **Who's-where** (`lib/whos-where.ts`, `WhosWhereSection` +
  `WhosWhereEditor`) — today's per-person status. **Still rendered from
  `/family`**, not the dashboard (confirmed unchanged on the latest `main`).
- **Maintenance clock** (`MaintenanceSection`) — a thin read of existing
  document renewal/end dates, not a new data model. **Still rendered from
  `/documents`**, not the dashboard (confirmed unchanged).
- **Guests pack** (`app/(app)/settings/GuestPackPanel.tsx`, `lib/guests.ts`)
  — 5 free-text columns on `households`; the wifi password field is a
  plain, unmasked text input.
- **Shared inbox** — the "Home inbox" category, still present (8 categories
  total; see Property hub).
- **Child view** — `components/ViewModeToggle.tsx`, device-local,
  explicitly not access control. Not to be confused with the kid-view
  *secret link* (phase 3d), which genuinely restricts what's visible and is
  meant to be shared outside the device.

**Drift — components that no longer render where earlier phases described,
now confirmed across two separate rewrites.** All of the following still
exist as files (some under `app/(app)/dashboard/` by path) but their actual
render status has moved on:

| Component | Actually rendered from |
| --- | --- |
| `WhosWhereSection` | `/family` only (unchanged) |
| `MaintenanceSection` | `/documents` only (unchanged) |
| `HelpfulHintsSection` | **nowhere — orphaned** |
| `ShoppingSection` | **nowhere — orphaned** |
| `PropertyHub` / `HouseFileSection` | **nowhere — orphaned as of the phase-16 Home rewrite; see Property hub section** |
| `ComingUpSection` / `ComingUpList` / `ComingUpTappableRow` | **`ComingUpTappableRow` was deleted outright in `420c034`; `ComingUpSection`/`ComingUpList` are still in the tree but `ComingUpSection` has zero importers on current `main` — the Home card deck (phase 16) replaced this whole chain.** |

Three of these were already dead before phase 16; phase 16 added
`PropertyHub`/`HouseFileSection` and the whole `ComingUpSection` chain to
the list. Don't assume a component renders somewhere just because it's
still in the repo and an earlier revision of this doc said so — check the
actual import graph (`git grep <ComponentName>`) before building on top of
one of these.

## Home UI, theme and the card deck (phase 16)

This phase replaced the earlier "map hero + Coming-up list + house-file
peek" Home shape (described in older revisions of this doc as "phase 13")
with a different structure. If you're picking this doc up expecting that
older shape, re-read this section — it changed underneath the same route.

- **`app/(app)/dashboard/page.tsx`** is now minimal: `requireOnboarded()` +
  the `?week=` search param, rendering a single `<EveningMapHome>`. It no
  longer composes hero/Coming-up/house-file as siblings the way earlier
  phases did.
- **`EveningMapHome` → `EveningMapView`** fetches Coming-up entries,
  who's-where statuses and the home map, and renders: the full-bleed
  theme-aware map (see Design system), a greeting overlay, who's-where
  chips, the invites banner, and the card deck.
- **The card deck** (`EveningCardStack.tsx` + `EveningCardStackHost.tsx`) —
  Coming-up entries rendered as a literal 3-card fan the household can
  drag-swipe or tap Shuffle to cycle (front card rotates to the back). Each
  stacked card is tinted via `cardTintForEntry()` (the tapped person's
  member colour, else a kind-tone colour). A "See all (N)" pill opens the
  full list in `EveningComingUpSheet` (a `BottomSheet`) — `N` is every
  Coming-up entry, not just the ~6 fanned into the deck.
- **Tapping any card or Coming-up row opens the real record**, not a generic
  popup: `comingUpHref(entry)` in `lib/coming-up.ts` is the single
  destination map (event/school/shared → `/calendar?...&event=<kind>:<id>`
  opening `CalendarEventDetailSheet`; renewal → `/family?renewal=<id>`;
  document → `/documents?doc=<id>`; birthday → `/family?person=<id>`;
  routine → `/family?routine=<id>`; timetable →
  `/family?timetable=<personId>&weekday=<n>`). The deck animates a
  grow/morph into the destination (a plain fade under reduced-motion) before
  navigating — it's a real `router.push`, not a modal that stays put.
- **"Your week ahead"** (`lib/week-ahead.ts`) is a **weekend-only special
  case**, not a standing lookahead window: it only exists when
  `isWeekAheadWindow()` is true — Saturday from 17:00, all of Sunday, or
  Monday before noon, computed in Europe/London — and is `null` the rest of
  the week (Tue through Fri, and Monday afternoon onward). When present it
  leads the card deck as its own card; tapping it grow-morphs into
  `WeekAheadSheet` — the upcoming Mon–Sun grouped by day (empty days read
  "Nothing planned"), colour-coded per person, covering key dates,
  renewals, birthdays and routines. `/dashboard?week=1` deep-links straight
  into this sheet.
- **Theme**: see the Design system section above — this whole rewrite is
  also where the light/dark semantic token system and the theme-aware home
  map (`?style=light|dark`) shipped.
- **Shell composition is otherwise unchanged**: `app/(app)/layout.tsx` still
  calls `requireOnboarded()` once and renders one shared shell (`ShellRouter`
  → `AppShell` or `HubShell`) round `{children}` — moving between ordinary
  tabs still only re-renders the page below the shell. The bottom tab bar is
  now a floating glass pill (theme-aware) rather than a plain bar, but it's
  the same architectural piece.
- **Home affordance drift** (still true, predates phase 16): the signed-in
  header carries no `Wordmark` link back to Home; `AppMark` is the day-to-day
  brand mark instead.

## Hub / Lounge mode

- **`/hub`** — a signed-in, read-mostly display for a landscape iPad on a
  kitchen counter. Three columns (Today, Who's-where + Meals, Coming-up),
  composed server-side by `lib/hub-data.ts` from the existing loaders.
  Unaffected by the sharing/renewals/theme wave — confirmed unchanged.
  - **Access**: in `proxy.ts`'s protected prefixes, `requireOnboarded()`
    gated — not a no-auth kiosk.
  - **Chrome**: `HubShell` (no tab bar, no FAB, no sticky header), picked by
    `ShellRouter`. `HubClock` + `HubRefresh` (60s `router.refresh()`).
  - **Entry point**: a Settings link (`HubDisplayLink`); native deep link
    `co.rodor.homeapp://hub`.

## iOS Capacitor shell + native auth

- **The native project is not in this repo.** `docs/ios-capacitor-kickoff.md`
  documents the "thin shell" pattern shared with the sibling Rodor product
  GraftMate: a separate repo (`rodor1155/ios-shell-template`, instance
  `instances/homeapp/`) wraps this app's live deployed URL in a WKWebView.
  Bundle ID `co.rodor.homeapp`, URL scheme `co.rodor.homeapp://`. Most UI
  ships by deploying this repo to Vercel; a native rebuild is only needed for
  Info.plist, AppIcon, splash, plugins, device family, export compliance, or
  signing changes. Before a first App Store submit, also read the GraftMate
  ASC-lessons page linked from the homeapp Notion hub — a reusable playbook
  written specifically for this kind of submission. Last known status: the
  homeapp submission was blocked on an App Store Connect Issuer ID — confirm
  current status in Notion rather than assuming that's still true.
- **Detecting the shell**: `lib/is-capacitor-native.ts` checks
  `window.Capacitor.isNativePlatform?.()`, deliberately not the mere
  presence of `window.Capacitor.Plugins` (which gets populated with web
  fallbacks even in an ordinary browser, since the shell loads the same JS
  bundle as the web app).
- **Native Google sign-in**: `lib/native-google-sign-in.ts` starts Supabase
  OAuth with `skipBrowserRedirect: true` and opens it in the Capacitor
  Browser plugin (in-app SFSafariViewController) rather than the main
  WKWebView, because plain in-WebView Google OAuth is unreliable on iOS.
  `redirectTo` points at `app/auth/native-bridge/page.tsx`, which hands off
  to the custom URL scheme `co.rodor.homeapp://auth/callback` (with a
  same-tab fallback). `components/NativeOAuthListener.tsx` (mounted
  app-wide) catches the deep link, dedupes via `sessionStorage`, closes the
  in-app browser, and completes the session in the **main** WKWebView.
- **`lib/public-app-origin.ts`** prefers `NEXT_PUBLIC_SITE_URL` over
  `window.location.origin` because a Capacitor WebView's origin can be
  something meaningless like `capacitor://localhost`. `siteUrl()` in
  `app/actions/auth.ts` does the server-side equivalent.
- **Auto-confirm signups**: `signUpWithPassword` auto-confirms new email
  signups via the admin client (correctly routed through
  `lib/supabase-admin.ts`) because Supabase's mailer often doesn't deliver
  and custom Auth SMTP isn't wired everywhere; it also distinguishes an
  already-registered email from a genuine new signup.

## Tab navigation cache

- **Tab Client Cache**: `experimental.staleTimes` (`dynamic` 120s, `static`
  300s with `prefetch={true}` on the tab bar). `PrefetchAppRoutes` warms
  every tab plus settings as soon as the shell mounts. Pull-to-refresh calls
  `router.refresh()` when fresh data is needed. Unchanged.

## Shopping lists (phase 8)

Unchanged mechanism (`app/actions/lists.ts`, `ItemsPanel` optimistic via
`useOptimistic`, `moveItem` same-group swap). The old dashboard "Shopping"
teaser line (`ShoppingSection`) is still dead code, unaffected by phase 16 —
`/lists` itself is unaffected.

## Conventions

- Server-only modules import `server-only` at the top. A component that
  transitively imports something server-only through a shared lib and gets
  bundled client-side is a real, seen-in-this-repo failure mode — prefer a
  small structural type over the real one when a client component only
  needs a field's shape (see `lib/calendar-event-detail.ts`'s
  `ComingUpDetailSource`).
- Never reference `SUPABASE_SERVICE_ROLE_KEY` outside `lib/supabase-admin.ts`.
- Keep `.env*` out of git (already in `.gitignore`).
- New DDL goes through a migration file **and** is applied to the project;
  re-run the Supabase security advisor after DDL. **This doc has drifted out
  of sync with reality on migration-applied status twice already** — always
  verify against the live project, never trust a status line here or assume
  the filesystem is the source of truth.
- Upload flow: client asks `createUploadTarget` (server) for a signed URL,
  uploads straight to Storage, then calls `recordDocument` (server) —
  **except** Gmail-imported documents, which go straight through
  `importDocumentFromBuffer` on the admin client instead.
- Never hard-code a colour in a component — light/dark both have to work
  everywhere; use a semantic token or a legacy alias (see Design system).
- Household resolution in server actions must resolve the caller's
  **active** (most recently joined) membership since sharing shipped, not
  simply "a" membership — most `app/actions/*.ts` files still do this by
  hand rather than through one shared helper.
- **Before assuming this doc is current**: check for an open, unmerged
  "update CLAUDE.md" PR. Two separate waves of work have now landed on
  `main` without a prior doc update being merged first, which is exactly
  how this file went stale in two different directions at once.

## Environment variables

Local in `.env.local` (git-ignored, `.env.example` is the maintained,
authoritative copy — verified current on this revision); mirror into Vercel
(Production + Preview).

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
| `CARTO_BASEMAPS_API_KEY` | server-only | CARTO Voyager map tiles for the home map (both light and dark styles); unset = falls back to OSM tiles |

No new environment variables were introduced by the sharing/renewals/ICS-feed/
theme wave — confirmed against the current `.env.example`.

## Verification harness

`scripts/verify-flows.mjs` runs invite-accept and delete-account checks
against the linked Supabase project using the service role. Requires
`.env.local`. A newer, uncommitted harness also exists:
`.agent-logs/account-deletion-e2e.mts` (`npx tsx .agent-logs/account-deletion-e2e.mts`)
covering the rewritten deletion flow including the owner-transfer trigger.

## Supabase config not captured in code (do this in the dashboard)

- **Auth → URL Configuration**: Site URL = prod origin; add
  `<NEXT_PUBLIC_SITE_URL>/auth/callback` for local + prod to the redirect allow-list.
- **Auth → Providers → Google**: this is the *sign-in* Google client, configured
  entirely in the Supabase dashboard — separate from the Gmail-import
  `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` app env vars. Add
  `<SUPABASE_URL>/auth/v1/callback` as an authorized redirect URI in Google
  Cloud for this client.
- **Gmail import's Google Cloud client** (separate from the above): a Web
  application OAuth client with Gmail API enabled, redirect URIs
  `{SITE}/api/gmail/callback` for both local and prod.
- Built-in email is heavily rate-limited — add custom SMTP before real traffic.
- **Vault secrets** `extraction_webhook_url` + `extraction_webhook_secret`.
- Pre-existing security-advisor WARNs left alone: `public.rls_auto_enable()`
  and `pg_net` living in `public`. "Leaked password protection" is off.

## Assumptions changed from earlier phases

- Phase 1 CLAUDE.md said "no middleware". Next 16 replaced Middleware with
  Proxy; `proxy.ts` handles Supabase session refresh + the auth redirect.
- Onboarding gate = household has a `locale` **and** at least one property row.
- `/documents` now scopes its query by `property_id`.
- Model is pinned to `claude-sonnet-4-6` for extraction (documents *and*
  timetables) — `EXTRACTION_MODEL` in `lib/extraction.ts`.
- `/sign-in` + `/sign-up` take `?next=` (sanitised by `safeNextPath`),
  honoured by password, magic link, OAuth and email-confirmation alike via
  `/auth/callback?next=…` — this widened from "password flows only" once
  link-invite sharing needed signed-out visitors to land back on `/join/*`.
- `/invite`, `/join/*` and `/kid/*` are deliberately **not** in `proxy.ts`'s
  protected prefixes — they have to render for a signed-out visitor.
- **Every migration is applied as of this writing (31 files).** This doc has
  now carried stale "written but not applied" caveats on *two separate
  occasions* — once for the phase 1-8 tables, again for the phase
  3d/14/15 ones. Verify directly against the live migration history every
  time, never propagate a status line forward without checking.
- **There are eight `CATEGORIES`, not seven** ("Home inbox" added) — this
  particular stale claim reappeared in a later revision of this doc after
  an even later revision had already fixed it, because the fix was sitting
  in an unmerged PR when the next wave of work branched off the old text.
- **The active household is the caller's most recently joined membership**,
  not "the oldest" — this changed when link-invite sharing shipped
  (previously a household with an unapplied migration or an empty state was
  the only thing that made "oldest" ambiguous; now a person can
  legitimately belong to two real households and the app has to pick one).
- **The dashboard's actual composition has now been rewritten twice** since
  the original "hero map + Coming up + house-file peek" description: once
  to strip Helpful hints / Shopping / Who's-where / Maintenance off Home
  (rebrand pass), and again to replace Coming-up-as-a-list with the phase-16
  card deck. `PropertyHub`/`HouseFileSection` is a further casualty — it
  survived the first rewrite (still called, in `peek` mode) but not the
  second. Don't trust any description of "what's on Home" in this file
  without checking `app/(app)/dashboard/page.tsx` and its immediate
  children directly first.
