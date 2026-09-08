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

const inputCls =
  "rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50";
const btnPrimary =
  "rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background disabled:opacity-50";
const btnSecondary =
  "rounded-md border border-black/15 px-3 py-2 text-sm font-medium hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/5";

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
    <div className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-6 px-4 py-12">
      <div>
        <h1 className="text-xl font-semibold">
          {isSignUp ? "Create your account" : "Sign in"}
        </h1>
        <p className="mt-1 text-sm opacity-70">
          {isSignUp
            ? "Set up your household in a minute."
            : "Welcome back to homeapp."}
        </p>
      </div>

      <button
        type="button"
        onClick={handleGoogle}
        disabled={googlePending}
        className={btnSecondary}
      >
        {googlePending ? "Redirecting…" : "Continue with Google"}
      </button>

      <div className="flex items-center gap-3 text-xs uppercase tracking-wide opacity-50">
        <span className="h-px flex-1 bg-current" />
        or
        <span className="h-px flex-1 bg-current" />
      </div>

      <form action={pwSubmit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputCls}
            placeholder="you@example.com"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Password
          <input
            name="password"
            type="password"
            required
            autoComplete={isSignUp ? "new-password" : "current-password"}
            minLength={isSignUp ? 8 : undefined}
            className={inputCls}
            placeholder={isSignUp ? "At least 8 characters" : "Your password"}
          />
        </label>
        <button type="submit" disabled={pwPending} className={btnPrimary}>
          {pwPending ? "Working…" : isSignUp ? "Sign up" : "Sign in"}
        </button>
      </form>

      <form action={mlSubmit} className="flex flex-col gap-2">
        <input type="hidden" name="email" value={email} />
        <button
          type="submit"
          disabled={mlPending || email.length === 0}
          className={btnSecondary}
        >
          {mlPending ? "Sending…" : "Email me a sign-in link"}
        </button>
      </form>

      {notice ? (
        <p
          className={`text-sm ${
            isError
              ? "text-red-600 dark:text-red-400"
              : "text-green-700 dark:text-green-400"
          }`}
        >
          {notice}
        </p>
      ) : null}

      <p className="text-sm opacity-70">
        {isSignUp ? (
          <>
            Already have an account?{" "}
            <Link className="underline" href="/sign-in">
              Sign in
            </Link>
          </>
        ) : (
          <>
            New here?{" "}
            <Link className="underline" href="/sign-up">
              Create an account
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
