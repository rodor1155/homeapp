# iOS / Capacitor kickoff (not started)

Overnight note only — do not block App Store or Xcode work on this.

When ready:

1. `npm i @capacitor/core @capacitor/cli @capacitor/ios`
2. `npx cap init homeapp <app-id> --web-dir out`
3. `npx cap add ios` then open in Xcode for signing

The web app already uses a bottom tab bar and safe-area padding
(`pb-[env(safe-area-inset-bottom)]`). Prefer a thin Capacitor shell around the
deployed site before a full native rewrite.
