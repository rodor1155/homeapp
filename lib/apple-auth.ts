import "server-only";

import { createPrivateKey, sign } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_BUNDLE_ID } from "@/lib/appstore/config";

/* Sign in with Apple, server side. The iPhone app signs in natively and
   Supabase verifies the identity token; this module does the one thing
   Supabase does not: it exchanges the app's one-time authorization code for a
   refresh token, keeps it, and revokes it when the account is deleted
   (App Review Guideline 5.1.1(v)).

   Talking to Apple needs a client secret — a short-lived ES256 JWT signed with
   the Sign in with Apple key from the developer account. The team id, key id
   and private key all come from the environment and are never committed. */

const APPLE_AUDIENCE = "https://appleid.apple.com";
const TOKEN_URL = "https://appleid.apple.com/auth/token";
const REVOKE_URL = "https://appleid.apple.com/auth/revoke";
const REQUEST_TIMEOUT_MS = 10_000;

type AppleAuthConfig = {
  teamId: string;
  keyId: string;
  privateKey: string;
  /** For a native app this is the bundle id the identity token was issued to. */
  clientId: string;
};

function appleAuthConfig(): AppleAuthConfig | null {
  const teamId = process.env.APPLE_TEAM_ID?.trim();
  const keyId = process.env.APPLE_SIWA_KEY_ID?.trim();
  // Vercel stores multi-line values either verbatim or with literal "\n".
  const privateKey = process.env.APPLE_SIWA_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  if (!teamId || !keyId || !privateKey) return null;
  return {
    teamId,
    keyId,
    privateKey,
    clientId:
      process.env.APPLE_SIWA_CLIENT_ID?.trim() ||
      process.env.APPSTORE_BUNDLE_ID?.trim() ||
      DEFAULT_BUNDLE_ID,
  };
}

export function isAppleAuthConfigured(): boolean {
  return appleAuthConfig() !== null;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

/** The client secret Apple asks for: an ES256 JWT good for five minutes. */
export function createAppleClientSecret(
  config: AppleAuthConfig,
  now: Date = new Date()
): string {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const header = base64url(JSON.stringify({ alg: "ES256", kid: config.keyId }));
  const claims = base64url(
    JSON.stringify({
      iss: config.teamId,
      iat: issuedAt,
      exp: issuedAt + 300,
      aud: APPLE_AUDIENCE,
      sub: config.clientId,
    })
  );
  const signature = sign("sha256", Buffer.from(`${header}.${claims}`), {
    key: createPrivateKey(config.privateKey),
    dsaEncoding: "ieee-p1363",
  });
  return `${header}.${claims}.${base64url(signature)}`;
}

async function postForm(
  url: string,
  fields: Record<string, string>
): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: "no-store",
  });
}

/** The `sub` claim of a token that came straight from Apple over TLS. */
function subjectOf(idToken: unknown): string | null {
  if (typeof idToken !== "string") return null;
  const payload = idToken.split(".")[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof claims?.sub === "string" ? claims.sub : null;
  } catch {
    return null;
  }
}

export type AppleCodeExchange =
  | { ok: true; refreshToken: string; appleUserId: string | null }
  | { ok: false; error: string };

/** Trades the app's one-time authorization code for a refresh token. */
export async function exchangeAppleAuthorizationCode(
  authorizationCode: string
): Promise<AppleCodeExchange> {
  const config = appleAuthConfig();
  if (!config) return { ok: false, error: "not_configured" };

  try {
    const response = await postForm(TOKEN_URL, {
      client_id: config.clientId,
      client_secret: createAppleClientSecret(config),
      code: authorizationCode,
      grant_type: "authorization_code",
    });
    const body = (await response.json().catch(() => ({}))) as {
      refresh_token?: unknown;
      id_token?: unknown;
      error?: unknown;
    };
    if (!response.ok || typeof body.refresh_token !== "string") {
      return {
        ok: false,
        error: typeof body.error === "string" ? body.error : `http_${response.status}`,
      };
    }
    return {
      ok: true,
      refreshToken: body.refresh_token,
      appleUserId: subjectOf(body.id_token),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "request_failed",
    };
  }
}

/** Apple's `sub` for this user, from their Supabase Apple identity. */
export function appleIdentityIdOf(user: {
  identities?: Array<{
    provider?: string;
    id?: string;
    identity_data?: Record<string, unknown> | null;
  }> | null;
}): string | null {
  const identity = (user.identities ?? []).find(
    (entry) => entry.provider === "apple"
  );
  if (!identity) return null;
  const sub = identity.identity_data?.sub;
  return typeof sub === "string" && sub ? sub : (identity.id ?? null);
}

export async function saveAppleRefreshToken(
  admin: SupabaseClient,
  userId: string,
  appleUserId: string,
  refreshToken: string
): Promise<{ error: string | null }> {
  const { error } = await admin.from("apple_sign_in_tokens").upsert(
    {
      user_id: userId,
      apple_user_id: appleUserId,
      refresh_token: refreshToken,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  return { error: error?.message ?? null };
}

export type AppleRevocationResult = {
  action:
    | "revoked"
    | "not_an_apple_account"
    | "no_token"
    | "not_configured"
    | "failed";
  error?: string;
};

/**
 * Revokes this user's Sign in with Apple token, if they have one. Called just
 * before the account is deleted. It reports rather than throws: someone asking
 * to delete their account must not be stopped by Apple being unreachable. A
 * failure is logged loudly so it can be followed up by hand.
 */
export async function revokeAppleSignInForUser(
  admin: SupabaseClient,
  userId: string
): Promise<AppleRevocationResult> {
  let refreshToken: string | null = null;
  try {
    const { data, error } = await admin
      .from("apple_sign_in_tokens")
      .select("refresh_token")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    refreshToken = (data?.refresh_token as string | undefined) ?? null;
  } catch (error) {
    const message = error instanceof Error ? error.message : "read failed";
    console.error(`[apple-auth] could not read the Apple token for ${userId}: ${message}`);
    return { action: "failed", error: message };
  }

  if (!refreshToken) {
    let signedInWithApple = false;
    try {
      const { data } = await admin.auth.admin.getUserById(userId);
      signedInWithApple = data.user ? appleIdentityIdOf(data.user) !== null : false;
    } catch {
      signedInWithApple = false;
    }
    if (!signedInWithApple) return { action: "not_an_apple_account" };
    console.error(
      `[apple-auth] ${userId} signed in with Apple but has no stored token to revoke`
    );
    return { action: "no_token" };
  }

  const config = appleAuthConfig();
  if (!config) {
    console.error(
      `[apple-auth] cannot revoke the Apple token for ${userId}: APPLE_TEAM_ID / APPLE_SIWA_KEY_ID / APPLE_SIWA_PRIVATE_KEY are not set`
    );
    return { action: "not_configured" };
  }

  try {
    const response = await postForm(REVOKE_URL, {
      client_id: config.clientId,
      client_secret: createAppleClientSecret(config),
      token: refreshToken,
      token_type_hint: "refresh_token",
    });
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 200);
      console.error(
        `[apple-auth] Apple refused to revoke the token for ${userId}: ${response.status} ${detail}`
      );
      return { action: "failed", error: `http_${response.status}` };
    }
    return { action: "revoked" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "request_failed";
    console.error(`[apple-auth] revoking the Apple token for ${userId} failed: ${message}`);
    return { action: "failed", error: message };
  }
}
