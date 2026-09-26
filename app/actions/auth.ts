"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { safeNextPath } from "@/lib/safe-path";

export type AuthState = { error?: string; success?: string } | undefined;

function siteUrl(): string {
  const fromEnv = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/+$/, "");
  // Never ship auth emails / redirects that point at a developer machine.
  if (fromEnv && !/localhost|127\.0\.0\.1/i.test(fromEnv)) return fromEnv;
  const vercel = process.env.VERCEL_URL?.replace(/\/+$/, "");
  if (vercel) return `https://${vercel}`;
  if (fromEnv) return fromEnv;
  return "http://localhost:3000";
}

function readEmail(formData: FormData): string {
  return String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
}

/**
 * Where to land once signed in — set by the page that sent the user here.
 * Only the password flows can honour it: Supabase matches `emailRedirectTo`
 * and OAuth `redirectTo` against the allow-list as whole strings, query
 * included, so a link round-trip has to come back to the bare callback and
 * let `/` route from there.
 */
function readNext(formData: FormData): string {
  return safeNextPath(String(formData.get("next") ?? ""));
}

export async function signInWithPassword(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = readEmail(formData);
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };

  redirect(readNext(formData));
}

export async function signUpWithPassword(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = readEmail(formData);
  const password = String(formData.get("password") ?? "");
  if (!email || password.length < 8) {
    return {
      error: "Enter your email and a password of at least 8 characters.",
    };
  }

  const next = readNext(formData);
  const callback =
    next === "/"
      ? `${siteUrl()}/auth/callback`
      : `${siteUrl()}/auth/callback?next=${encodeURIComponent(next)}`;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: callback },
  });
  if (error) return { error: error.message };

  // Already registered (e.g. Google): Supabase returns empty identities and
  // sends no confirmation email — don't claim one was sent.
  const identities = data.user?.identities ?? [];
  if (data.user && identities.length === 0) {
    return {
      error:
        "An account with this email already exists. Sign in with Google, or use Sign in if you already set a password.",
    };
  }

  // Built-in Supabase mailer often never delivers. Until custom Auth SMTP is
  // wired, auto-confirm new email signups and sign them in immediately
  // (same effective behaviour as GraftMate / Confirm email off).
  if (!data.session && data.user) {
    try {
      const admin = createAdminClient();
      const { error: confirmError } = await admin.auth.admin.updateUserById(
        data.user.id,
        { email_confirm: true }
      );
      if (confirmError) {
        return { error: confirmError.message };
      }
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        return {
          error:
            "Account created, but sign-in failed. Try Sign in with the same email and password.",
        };
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not finish signup.";
      return { error: message };
    }
  }

  redirect(next);
}

export async function sendMagicLink(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = readEmail(formData);
  if (!email) return { error: "Enter your email address." };

  const next = readNext(formData);
  const callback =
    next === "/"
      ? `${siteUrl()}/auth/callback`
      : `${siteUrl()}/auth/callback?next=${encodeURIComponent(next)}`;
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: callback,
      shouldCreateUser: true,
    },
  });
  if (error) return { error: error.message };

  return { success: "Check your email for a sign-in link." };
}
