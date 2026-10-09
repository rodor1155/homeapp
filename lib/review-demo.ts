/* The App Review demo account. Apple's reviewer signs in with an email and
   password we give them in App Store Connect; that one account is let past the
   paywall so every screen can be reviewed without a purchase.

   Who it is comes from the environment (REVIEW_DEMO_EMAIL) — never from the
   client and never hard-coded — and its password lives only in Supabase Auth.
   Unset means there is no demo account. See docs/appstore/review-notes.md. */

export function reviewDemoEmail(): string | null {
  const email = process.env.REVIEW_DEMO_EMAIL?.trim().toLowerCase();
  return email && email.includes("@") ? email : null;
}

export function isReviewDemoEmail(email: string | null | undefined): boolean {
  const demo = reviewDemoEmail();
  if (!demo || !email) return false;
  return email.trim().toLowerCase() === demo;
}
