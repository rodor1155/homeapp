"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  sendMagicLink,
  signInWithPassword,
  signUpWithPassword,
  type AuthState,
} from "@/app/actions/auth";
import { createClient } from "@/lib/supabase-client";
import { Button, Field, Wordmark } from "@/components/ui";

export default function AuthPanel({ mode }: { mode: "sign-in" | "sign-up" }) {
  const isSignUp = mode === "sign-up";
  const passwordAction = isSignUp ? signUpWithPassword : signInWithPassword;

  const [email, setEmail] = useState("");
  const [pwState, pwSubmit, pwPending] = useActionState<AuthState, FormData>(
    passwordAction,
    undefined
  );
  const [mlState, mlSubmit, mlPending] = useActionState<AuthState, FormData>(
    sendMagicLink,
    undefined
  );
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [googlePending, setGooglePending] = useState(false);

  async function handleGoogle() {
    setGoogleError(null);
    setGooglePending(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setGoogleError(error.message);
      setGooglePending(false);
    }
  }

  const notice =
    pwState?.error ??
    pwState?.success ??
    mlState?.error ??
    mlState?.success ??
    googleError ??
    null;
  const isError = Boolean(pwState?.error || mlState?.error || googleError);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[27rem] flex-col justify-center gap-7 px-5 py-12">
      <header className="flex flex-col gap-4">
        <Wordmark className="text-sm" />
        <div>
          <h1 className="text-2xl">
            {isSignUp ? "Start your household file" : "Welcome back"}
          </h1>
          <p className="mt-1.5 text-sm text-ink-soft">
            {isSignUp
              ? "One place for the paperwork that protects your home."
              : "Sign in to your household file."}
          </p>
        </div>
      </header>

      <div className="sheet flex flex-col gap-5">
        <Button variant="quiet" type="button" onClick={handleGoogle} disabled={googlePending}>
          {googlePending ? "Taking you to Google…" : "Continue with Google"}
        </Button>

        <div className="flex items-center gap-3 text-xs text-ink-faint">
          <span className="h-px flex-1 bg-rule" />
          or use your email
          <span className="h-px flex-1 bg-rule" />
        </div>

        <form action={pwSubmit} className="flex flex-col gap-4">
          <Field label="Email">
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="field-input"
              placeholder="you@example.com"
            />
          </Field>
          <Field label="Password">
            <input
              name="password"
              type="password"
              required
              autoComplete={isSignUp ? "new-password" : "current-password"}
              minLength={isSignUp ? 8 : undefined}
              className="field-input"
              placeholder={isSignUp ? "At least 8 characters" : "Your password"}
            />
          </Field>
          <Button type="submit" disabled={pwPending} className="mt-1">
            {pwPending
              ? "One moment…"
              : isSignUp
                ? "Create account"
                : "Sign in"}
          </Button>
        </form>

        <form action={mlSubmit} className="flex flex-col">
          <input type="hidden" name="email" value={email} />
          <button
            type="submit"
            disabled={mlPending || email.length === 0}
            className="text-action self-start text-sm disabled:opacity-40"
          >
            {mlPending ? "Sending a link…" : "Email me a sign-in link instead"}
          </button>
        </form>

        {notice ? (
          <p
            className={`text-sm ${isError ? "mark-fault" : "mark-filed"}`}
          >
            {notice}
          </p>
        ) : null}
      </div>

      <p className="text-sm text-ink-soft">
        {isSignUp ? (
          <>
            Already have a file?{" "}
            <Link className="text-action" href="/sign-in">
              Sign in
            </Link>
          </>
        ) : (
          <>
            New here?{" "}
            <Link className="text-action" href="/sign-up">
              Start your household file
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
