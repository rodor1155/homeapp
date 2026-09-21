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
import { isCapacitorNative } from "@/lib/is-capacitor-native";
import { signInWithGoogleNative } from "@/lib/native-google-sign-in";
import PreAppShell from "@/components/PreAppShell";
import { Button, Field } from "@/components/ui";

export default function AuthPanel({
  mode,
  next = "/",
}: {
  mode: "sign-in" | "sign-up";
  /** Where to land once signed in. Already sanitised by the page. */
  next?: string;
}) {
  const isSignUp = mode === "sign-up";
  const passwordAction = isSignUp ? signUpWithPassword : signInWithPassword;
  const withNext = (path: string) =>
    next === "/" ? path : `${path}?next=${encodeURIComponent(next)}`;

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

    if (isCapacitorNative()) {
      const { error } = await signInWithGoogleNative();
      if (error) {
        setGoogleError(error);
        setGooglePending(false);
      }
      return;
    }

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
    <PreAppShell>
      <div className="sheet flex flex-col gap-5">
        <div>
          <h1 className="text-xl">
            {isSignUp ? "Create your account" : "Welcome back"}
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            {isSignUp
              ? "Set up your household in a few minutes."
              : "Sign in to pick up where you left off."}
          </p>
        </div>

        <Button variant="quiet" type="button" onClick={handleGoogle} disabled={googlePending}>
          {googlePending ? "Taking you to Google…" : "Continue with Google"}
        </Button>

        <div className="flex items-center gap-3 text-xs text-ink-faint">
          <span className="h-px flex-1 bg-rule" />
          or use your email
          <span className="h-px flex-1 bg-rule" />
        </div>

        <form action={pwSubmit} className="flex flex-col gap-4">
          <input type="hidden" name="next" value={next} />
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

      <p className="text-center text-sm text-ink-soft">
        {isSignUp ? (
          <>
            Already have an account?{" "}
            <Link className="text-action" href={withNext("/sign-in")}>
              Sign in
            </Link>
          </>
        ) : (
          <>
            New here?{" "}
            <Link className="text-action" href={withNext("/sign-up")}>
              Create an account
            </Link>
          </>
        )}
      </p>

      <p className="text-center text-xs text-ink-faint">
        <Link href="/privacy" className="text-action text-xs">
          Privacy policy
        </Link>
      </p>
    </PreAppShell>
  );
}
