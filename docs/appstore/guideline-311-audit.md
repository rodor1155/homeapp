# App Store Guideline 3.1.1 — web billing audit (Hearth web app)

Audit of user-visible strings and flows when the Next.js app runs inside the
Hearth Home iOS shell (`isCapacitorNative()` / `useCapacitorNativeState()`).
Web browsers keep Stripe checkout unchanged.

## Already compliant (no change required)

| Area | File | Lines | Notes |
| --- | --- | --- | --- |
| Settings Plan (native) | `app/(app)/settings/PlanPanel.tsx` | 55–77 | Renders `NativePlanPanel` only in shell; no Stripe prices or checkout. |
| Settings Plan (web) | `app/(app)/settings/PlanPanel.tsx` | 80–240 | Stripe checkout / portal / prices — web shell only. |
| Native plan UI | `app/(app)/settings/NativePlanPanel.tsx` | 1–188 | StoreKit paywall, restore, Apple manage subscription; no web pricing. |
| Paywall routing | `components/PlanProvider.tsx` | 65–84 | `usePaywall()` → `openNativePaywall()` when `HearthStore` is present. |
| Invite button | `components/InviteSomeoneButton.tsx` | 34 | Opens native paywall when `!canInvite`. |
| Invite sheet | `components/InviteSomeoneSheet.tsx` | 36–39 | Server `upgrade` flag → paywall, not Settings copy about web pay. |
| Key dates | `components/EventForm.tsx`, `CreateSheet.tsx`, `AddDateCard.tsx`, `EventsPanel.tsx` | various | Gate + `usePaywall("dates")`. |
| Privacy billing | `components/PrivacyBillingCopy.tsx` | 10–48 | Hides Stripe name in shell; Apple-only copy. |
| Privacy page | `app/privacy/page.tsx` | 79, 136 | Uses `BillingDataCopy` / `PaymentSubprocessors`. |
| Export (web) | `components/ExportButton.tsx` | 70–86 | “Upgrade in Settings” with Stripe plan card on web only. |
| Documents | `app/(app)/documents/DocumentsVaultHandoff.tsx` | 1–68 | Native vault handoff; no web billing. |
| Upgrade messages | `lib/billing.ts` | 37–41 | No Stripe / web wording. |
| Account deletion (in app) | `app/(app)/settings/DeleteAccountPanel.tsx` | 108–120 | Apple subscription note; no Stripe portal link. |
| Server entitlements | `lib/billing.ts`, `app/actions/*` | — | Gates only; no client-facing Stripe in native paths. |

## Findings fixed in this branch

| Severity | File | Lines | Issue | Fix |
| --- | --- | --- | --- | --- |
| High | `components/NativeExternalLinks.tsx` | 32–33 | Cross-origin Stripe checkout opened in SFSafariViewController (still in-app). | Block `isWebPaymentUrl` links in the shell. |
| High | `lib/open-external.ts` | 27–40 | `openExternalUrl` could open Stripe from web checkout response. | No-op for payment URLs in native shell. |
| High | `app/api/stripe/checkout/route.ts`, `portal/route.ts` | POST handlers | API could mint Stripe sessions from WKWebView. | `403` when `isNativeShellRequest()`. |
| Medium | `components/ExportButton.tsx` | 32–49 | Native export gate linked to Settings instead of StoreKit. | “See plans” → `usePaywall()`. |
| Low | `components/EventForm.tsx` | 116 | Upgrade error flashed before paywall. | Hide error when `state.upgrade`. |

## New helpers

- `lib/web-payment-url.mjs` — `isWebPaymentUrl()`
- `lib/native-shell-request.ts` — `isNativeShellRequest()`, optional header `x-hearth-native-shell: 1` for the iOS shell

## Manual checks (TestFlight)

- Settings → Plan: no Stripe, prices, or “Manage billing”; “See plans” opens StoreKit.
- Account → Download: “See plans” opens StoreKit when export is gated.
- Privacy policy: no Stripe subprocessors line in the shell.
- Tapping any stray Stripe URL does not open Safari sheet.
