# Hub / Lounge mode

Signed-in, read-mostly kitchen display for a landscape iPad or tablet shell.

## Route

- **Web:** `/hub` (auth required, same onboarding gate as other signed-in tabs)
- **Capacitor deep link:** `co.rodor.homeapp://hub` — handled by the iOS shell URL routing; lands on `/hub` when the session cookie is present.

## Layout (landscape)

| Zone | Content | Source |
| --- | --- | --- |
| Header | Household name (left); London clock + weekday date (right) | `requireOnboarded()` + client `HubClock` |
| Left — **Today** | Kit cues, routines, dinner | `lib/hub-data.ts` — timetable (today), routines (today), meal plan |
| Middle — **Who's where** | Person + status text | `loadPersonDayStatuses` + `loadHouseholdPeople` |
| Middle — **Meals** | Today / tomorrow dinners | `loadMealPlans` for the current Mon–Sun week |
| Right — **Coming up** | School ICS + document renewals | `schoolEntries` + `documentEntries` (future only) |
| Footer | “Hub mode · tap to open full app” → `/dashboard` | `HubShell` |

Panel headings link through to the full app: `/calendar`, `/dashboard`, `/family`, `/documents`.

## Chrome

- **`HubShell`** replaces `AppShell` on `/hub` (via `ShellRouter`) — no greeting bar, no bottom tab bar, full viewport width.
- Type is larger on hub rows (~`text-xl`, 20–24px).
- **Auto-refresh:** `HubRefresh` calls `router.refresh()` every 60 seconds.

## Entry

Settings → **Hub display** → “Open hub display”.

## Out of scope (by design)

Smart home, photo carousel, trivia, timers, no-auth kiosk, App Store submit.

## Implementation map

| File | Role |
| --- | --- |
| `lib/hub-data.ts` | One server load; reuses coming-up / family / meals loaders |
| `app/(app)/hub/page.tsx` | Three-column page |
| `components/HubShell.tsx` | Header, footer, refresh |
| `components/HubClock.tsx` | London time (client) |
| `components/ShellRouter.tsx` | Picks `HubShell` vs `AppShell` from pathname |
| `components/HubDisplayLink.tsx` | Settings entry |
| `proxy.ts` | `/hub` in protected prefixes |
