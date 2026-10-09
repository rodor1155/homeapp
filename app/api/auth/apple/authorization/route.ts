import {
  appleIdentityIdOf,
  exchangeAppleAuthorizationCode,
  isAppleAuthConfigured,
  saveAppleRefreshToken,
} from "@/lib/apple-auth";
import { createAdminClient } from "@/lib/supabase-admin";
import { createClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

/* Called by the iPhone app straight after Sign in with Apple, with the
   one-time authorization code Apple gave it. The code is exchanged for a
   refresh token, which is stored so the token can be revoked when the account
   is deleted. Sign-in itself has already happened by this point; nothing here
   can sign anyone in. */

const MAX_BODY_BYTES = 8_000;

function fail(status: number, error: string): Response {
  return Response.json({ error }, { status });
}

export async function POST(request: Request) {
  let authorizationCode: unknown;
  try {
    const text = await request.text();
    if (text.length === 0 || text.length > MAX_BODY_BYTES) {
      return fail(400, "Send an authorizationCode.");
    }
    const body: unknown = JSON.parse(text);
    authorizationCode =
      typeof body === "object" && body !== null
        ? (body as Record<string, unknown>).authorizationCode
        : undefined;
  } catch {
    return fail(400, "Send an authorizationCode.");
  }
  if (typeof authorizationCode !== "string" || authorizationCode.length === 0) {
    return fail(400, "Send an authorizationCode.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail(401, "You are not signed in.");

  const appleUserId = appleIdentityIdOf(user);
  if (!appleUserId) {
    return fail(400, "This account did not sign in with Apple.");
  }

  if (!isAppleAuthConfigured()) {
    console.error(
      "[apple-auth] Sign in with Apple is in use but APPLE_TEAM_ID / APPLE_SIWA_KEY_ID / APPLE_SIWA_PRIVATE_KEY are not set — tokens cannot be revoked on account deletion"
    );
    return Response.json({ stored: false, reason: "not_configured" });
  }

  const exchange = await exchangeAppleAuthorizationCode(authorizationCode);
  if (!exchange.ok) {
    console.warn(`[apple-auth] code exchange failed for ${user.id}: ${exchange.error}`);
    return fail(400, "Apple did not accept the authorization code.");
  }
  // The code must have been issued to the same Apple ID this session belongs to.
  if (exchange.appleUserId !== appleUserId) {
    console.warn(`[apple-auth] code for a different Apple ID was sent by ${user.id}`);
    return fail(400, "Apple did not accept the authorization code.");
  }

  const { error } = await saveAppleRefreshToken(
    createAdminClient(),
    user.id,
    appleUserId,
    exchange.refreshToken
  );
  if (error) {
    console.error(`[apple-auth] could not store the Apple token for ${user.id}: ${error}`);
    return fail(500, "Could not finish setting up Sign in with Apple.");
  }
  return Response.json({ stored: true });
}
