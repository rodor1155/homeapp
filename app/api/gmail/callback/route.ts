import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import {
  exchangeGmailCode,
  fetchGmailProfile,
  saveGmailConnection,
} from "@/lib/gmail";
import { isGmailConfigured } from "@/lib/gmail-config";
import { createClient } from "@/lib/supabase-server";

function siteOrigin(): string {
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
}

export async function GET(request: NextRequest) {
  const origin = siteOrigin();
  const fail = (message: string) => {
    const url = new URL("/documents", origin);
    url.searchParams.set("gmail", "error");
    url.searchParams.set("message", message);
    return NextResponse.redirect(url);
  };

  if (!isGmailConfigured()) {
    return fail("Gmail import is not configured on this deployment.");
  }

  const params = request.nextUrl.searchParams;
  const error = params.get("error");
  if (error) {
    return fail(error === "access_denied" ? "Gmail connection was cancelled." : error);
  }

  const code = params.get("code");
  const state = params.get("state");
  const jar = await cookies();
  const expected = jar.get("gmail_oauth_state")?.value;
  jar.delete("gmail_oauth_state");

  if (!code || !state || !expected || state !== expected) {
    return fail("That Gmail sign-in link has expired. Try again.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/sign-in?next=/documents", origin));
  }

  const { data: membership } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!membership) {
    return fail("No household found for your account.");
  }

  try {
    const tokens = await exchangeGmailCode(code);
    if (!tokens.refresh_token) {
      return fail(
        "Google did not return a refresh token. Disconnect any existing access in your Google account and try again."
      );
    }

    const gmailAddress = await fetchGmailProfile(tokens.access_token);
    await saveGmailConnection({
      householdId: membership.household_id as string,
      userId: user.id,
      gmailAddress,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not connect Gmail.";
    return fail(message);
  }

  const url = new URL("/documents", origin);
  url.searchParams.set("gmail", "connected");
  return NextResponse.redirect(url);
}
