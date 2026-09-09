"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { safeNextPath } from "@/lib/safe-path";

export type AuthState = { error?: string; success?: string } | undefined;

function siteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return raw.replace(/\/+$/, "");
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
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${siteUrl()}/auth/callback` },
  });
  if (error) return { error: error.message };

  if (!data.session) {
    return {
      success: "Check your email to confirm your address, then sign in.",
    };
  }

  redirect(next);
}

export async function sendMagicLink(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = readEmail(formData);
  if (!email) return { error: "Enter your email address." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${siteUrl()}/auth/callback`,
      shouldCreateUser: true,
    },
  });
  if (error) return { error: error.message };

  return { success: "Check your email for a sign-in link." };
}
