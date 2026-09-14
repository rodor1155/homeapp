import "server-only";

const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

export const GMAIL_OAUTH_SCOPES = [GMAIL_READONLY_SCOPE];

export function isGmailConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CLIENT_SECRET?.trim()
  );
}

export function gmailRedirectUri(): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (!base) {
    throw new Error("Missing NEXT_PUBLIC_SITE_URL for Gmail OAuth redirect.");
  }
  return `${base}/api/gmail/callback`;
}

export function gmailSetupMessage(): string {
  return (
    "Gmail import is not set up yet. Add GOOGLE_CLIENT_ID and " +
    "GOOGLE_CLIENT_SECRET to your environment, and register " +
    `${gmailRedirectUri()} as an authorised redirect URI in Google Cloud Console.`
  );
}
