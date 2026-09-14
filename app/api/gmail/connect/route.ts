import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { buildGmailAuthUrl, createGmailOAuthState } from "@/lib/gmail";
import { gmailSetupMessage, isGmailConfigured } from "@/lib/gmail-config";
import { createClient } from "@/lib/supabase-server";

export async function GET() {
  if (!isGmailConfigured()) {
    const url = new URL("/documents", process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000");
    url.searchParams.set("gmail", "setup");
    url.searchParams.set("message", gmailSetupMessage());
    return NextResponse.redirect(url);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(
      new URL("/sign-in?next=/documents", process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000")
    );
  }

  const state = createGmailOAuthState();
  const jar = await cookies();
  jar.set("gmail_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return NextResponse.redirect(buildGmailAuthUrl(state));
}
