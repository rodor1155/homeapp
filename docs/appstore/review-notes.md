# App Review notes — Hearth Home

What Apple's reviewer needs, how the demo account works, and the text to paste into App Store Connect. Companion to `ios-shell-template` ▸ `docs/appstore/export-compliance.md`.

## 1. The demo account

App Review signs in with one email-and-password account whose household is already filled with sample data.

- **Who it is** comes from the environment: `REVIEW_DEMO_EMAIL` on Vercel. Nothing is hard-coded, and with the variable unset there is no demo account.
- **Its password** exists only in Supabase Auth. You choose it when you run the seed script; it is never in the repo or on Vercel.
- **Paywall bypass** is decided on the server, for that account only: `getEntitlements()` in `lib/billing.ts` returns the paid plan when the signed-in user's email equals `REVIEW_DEMO_EMAIL` (`lib/review-demo.ts`). Everything that depends on the plan goes through it — the export endpoint, the Settings page, the invite and family-date actions, and the plan the app layout passes to the iPhone app's own screens — so the demo account is never on the free plan. Nothing in the app or the browser can claim to be the demo account.
- The reviewer can still see the purchase flow: the demo account's Plan card says it has the full plan without a purchase and offers **See subscription options**, which opens the real paywall.

### Setting it up

1. Pick the address, e.g. an alias you control. Set `REVIEW_DEMO_EMAIL` on Vercel (Production) and redeploy.
2. On your own machine, with the production Supabase URL and service-role key in `.env.local` or the shell:

   ```bash
   REVIEW_DEMO_EMAIL=… REVIEW_DEMO_PASSWORD='a long random password' \
     node scripts/seed-review-demo.mjs            # dry run: prints the project and the plan
   node scripts/seed-review-demo.mjs --confirm <project-ref>
   ```

   The script does nothing until `--confirm` names the project it is pointed at. It creates the user (or resets its password), names the household "The Ashworths", and adds a home address, two adults, two children at two schools, upcoming dates, two shopping lists, routines, this week's meal plan and a school timetable.
3. Sign in once yourself in the TestFlight build to check it.
4. If a reviewer changes or deletes things, re-run with `--reset` (it only touches the demo household). If they delete the account — they are entitled to test that — re-run without `--reset` to recreate it.

The seed script has been dry-run only; it has not been run against a database from this branch. Run it against a Supabase branch or check the first run's output before relying on it.

### What the demo account does not cover

Documents live on the iPhone and in the reviewer's own iCloud, encrypted — they are not part of any server account, so the demo household's vault starts empty on the reviewer's device. That is expected; section 3 tells the reviewer how to add one.

## 2. Text for App Store Connect ▸ App Review Information

Sign-in required: **Yes**. User name: the `REVIEW_DEMO_EMAIL` address. Password: the one you set.

Notes (paste and adjust):

> Hearth Home is a household organiser. Sign in with the demo account above using "Sign in" with email and password (Sign in with Apple and Google are also offered).
>
> **Demo data.** The demo household ("The Ashworths") has family members, schools, dates, shopping lists, routines, a meal plan and a timetable already entered.
>
> **Free plan and subscription (Hearth Household, auto-renewable, monthly and yearly, 7-day free trial on yearly).** Without a subscription the app is free for one person, who can track up to 5 renewals, scanning included. The subscription adds sharing the household, unlimited renewals, the private document vault and adding family dates; the paywall opens when a free account adds a sixth renewal, invites someone, opens the Documents tab of the vault or adds a family date. Open Settings ▸ Plan. The demo account already has the full plan so every feature can be reviewed without paying; tap "See subscription options" there to open the paywall and make a sandbox purchase. Any other account sees "See plans" and "Restore purchases" in the same place.
>
> **Documents.** Open Documents and add one by scanning, or by choosing a photo or PDF. Documents are stored only on the device and in the user's own iCloud, end-to-end encrypted; they never reach our servers. iCloud must be signed in on the test device for sync, but adding a document works without it.
>
> **Apple Intelligence is optional.** On devices with Apple Intelligence the app uses the on-device model to help read a document. On every other device — including iOS 17–18, ineligible devices, Apple Intelligence switched off, or the model still downloading — the app reads the text with on-device OCR, shows a short note saying so, and every field can be typed in by hand. Nothing is sent to a server in either case.
>
> **Account deletion.** Settings ▸ Account ▸ Delete my account (type DELETE to confirm). This removes the sign-in and the household's data, and revokes Sign in with Apple for accounts created that way.
>
> **Sign in with Apple** is offered alongside Google on the sign-in screen.

## 3. Checks before submitting

- `REVIEW_DEMO_EMAIL` is set on Vercel and the account signs in.
- `APPSTORE_APP_APPLE_ID` is set on Vercel (otherwise billing is off and the Plan card shows no paywall), the two migrations are applied, and both subscription products are "Ready to Submit" and attached to the version.
- A sandbox purchase on TestFlight flips a normal account to "You are on Hearth Household", and Restore purchases works on a second install.
- The yearly product has a 7-day free trial introductory offer in App Store Connect. The paywall only mentions a trial when StoreKit offers one to that Apple Account, so without it the yearly plan is simply shown at its price.
- A normal account with no subscription can add five renewals and is shown the paywall on the sixth; the demo account is not limited.
- Nothing in the iPhone app mentions paying on the web or names a card processor (Settings ▸ Plan, the export message, the privacy policy).
- Optional hardening: set `x-hearth-native-shell: 1` on WKWebView requests so `/api/stripe/*` refuses checkout from the shell (see `lib/native-shell-request.ts` and `docs/appstore/guideline-311-audit.md`).
