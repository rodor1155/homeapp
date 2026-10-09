"use client";

import { useSyncExternalStore } from "react";
import { getNativePlugin } from "@/lib/native-plugin";
import { createClient } from "@/lib/supabase-client";

type AppleCredential = {
  identityToken: string;
  /** The raw nonce; Apple was given its SHA-256 hash. */
  nonce: string;
  authorizationCode?: string;
  email?: string;
  givenName?: string;
  familyName?: string;
};

type HearthAuthPlugin = {
  signInWithApple?: () => Promise<AppleCredential>;
};

function plugin(): HearthAuthPlugin | null {
  return getNativePlugin<HearthAuthPlugin>("HearthAuth");
}

/** True in an iPhone app build that ships native Sign in with Apple. */
export function hasNativeAppleSignIn(): boolean {
  return typeof plugin()?.signInWithApple === "function";
}

function subscribe() {
  return () => {};
}

/** SSR-safe; false until the client can inspect the Capacitor bridge. */
export function useHasNativeAppleSignIn(): boolean {
  return useSyncExternalStore(subscribe, hasNativeAppleSignIn, () => false);
}

function wasCancelled(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === "CANCELLED";
}

/**
 * Native Sign in with Apple, finished through Supabase.
 *
 * The app shows Apple's sheet and returns an identity token bound to a nonce:
 * Apple received the SHA-256 hash, and the raw value goes to Supabase, which
 * hashes it and checks it against the token. The session lands in this
 * WebView's cookies, the same as any other sign-in.
 *
 * The one-time authorization code is then handed to the server so the Apple
 * token can be revoked if the account is ever deleted.
 */
export async function signInWithAppleNative(): Promise<{
  error: string | null;
  cancelled?: boolean;
}> {
  const auth = plugin();
  if (!auth?.signInWithApple) {
    return { error: "Sign in with Apple isn’t available in this version of the app." };
  }

  let credential: AppleCredential;
  try {
    credential = await auth.signInWithApple();
  } catch (error) {
    if (wasCancelled(error)) return { error: null, cancelled: true };
    const message = (error as { message?: unknown } | null)?.message;
    return {
      error:
        typeof message === "string" && message
          ? message
          : "Sign in with Apple didn’t complete. Please try again.",
    };
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithIdToken({
    provider: "apple",
    token: credential.identityToken,
    nonce: credential.nonce,
  });
  if (error) return { error: error.message };

  // Apple only shares the name on the very first authorisation; keep it.
  const fullName = [credential.givenName, credential.familyName]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (fullName) {
    await supabase.auth
      .updateUser({ data: { full_name: fullName, name: fullName } })
      .catch(() => {});
  }

  if (credential.authorizationCode) {
    try {
      await fetch("/api/auth/apple/authorization", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authorizationCode: credential.authorizationCode }),
      });
    } catch {
      // Sign-in has succeeded; the server logs a failed exchange.
    }
  }

  return { error: null };
}
