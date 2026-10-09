-- Sign in with Apple: the refresh token Apple issues when the iPhone app's
-- authorization code is exchanged server-side. Kept for one purpose only —
-- revoking the token when the account is deleted (App Review Guideline
-- 5.1.1(v), POST https://appleid.apple.com/auth/revoke).
--
-- Service role only: RLS is on and there are no policies, so neither the
-- browser nor a signed-in user can read or write these rows. The row goes
-- with the user (on delete cascade); account deletion reads it first.

create table if not exists public.apple_sign_in_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- Apple's `sub` for this user, to check the token belongs to them.
  apple_user_id text not null,
  refresh_token text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.apple_sign_in_tokens enable row level security;

revoke all on public.apple_sign_in_tokens from anon, authenticated;
