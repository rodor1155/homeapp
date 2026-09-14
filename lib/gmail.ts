import "server-only";

import { randomBytes } from "node:crypto";
import { categoriseFromText } from "@/lib/categories";
import {
  GMAIL_OAUTH_SCOPES,
  gmailRedirectUri,
  isGmailConfigured,
} from "@/lib/gmail-config";
import { createAdminClient } from "@/lib/supabase-admin";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const SCAN_MONTHS = 12;
const MAX_MESSAGES = 200;

export type GmailConnectionRow = {
  id: string;
  household_id: string;
  user_id: string;
  gmail_address: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: string | null;
  last_scan_at: string | null;
  last_scan_error: string | null;
  created_at: string;
  updated_at: string;
};

export type GmailImportCandidateRow = {
  id: string;
  household_id: string;
  connection_id: string;
  gmail_message_id: string;
  gmail_attachment_id: string;
  filename: string;
  subject: string | null;
  sender: string | null;
  received_at: string | null;
  suggested_category: string | null;
  status: string;
  document_id: string | null;
  import_error: string | null;
  created_at: string;
};

export type GmailConnectionPublic = {
  id: string;
  gmailAddress: string;
  connectedAt: string;
  lastScanAt: string | null;
  lastScanError: string | null;
};

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  token_type: string;
};

type GmailMessageList = {
  messages?: Array<{ id: string }>;
  nextPageToken?: string;
};

type GmailHeader = { name: string; value: string };

type GmailMessagePart = {
  mimeType?: string;
  filename?: string;
  body?: { attachmentId?: string; size?: number };
  parts?: GmailMessagePart[];
};

type GmailMessage = {
  id: string;
  internalDate?: string;
  payload?: {
    headers?: GmailHeader[];
    parts?: GmailMessagePart[];
    mimeType?: string;
    filename?: string;
    body?: { attachmentId?: string; size?: number };
  };
};

export function createGmailOAuthState(): string {
  return randomBytes(24).toString("hex");
}

export function buildGmailAuthUrl(state: string): string {
  if (!isGmailConfigured()) {
    throw new Error("Gmail OAuth is not configured.");
  }
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!.trim(),
    redirect_uri: gmailRedirectUri(),
    response_type: "code",
    scope: GMAIL_OAUTH_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

async function exchangeTokens(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  const json = (await res.json()) as TokenResponse & { error?: string };
  if (!res.ok) {
    throw new Error(json.error ?? "Could not exchange Gmail OAuth tokens.");
  }
  return json;
}

export async function exchangeGmailCode(code: string): Promise<TokenResponse> {
  return exchangeTokens({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID!.trim(),
    client_secret: process.env.GOOGLE_CLIENT_SECRET!.trim(),
    redirect_uri: gmailRedirectUri(),
    grant_type: "authorization_code",
  });
}

async function refreshAccessToken(
  connection: GmailConnectionRow
): Promise<{ accessToken: string; expiresAt: string | null }> {
  const tokens = await exchangeTokens({
    client_id: process.env.GOOGLE_CLIENT_ID!.trim(),
    client_secret: process.env.GOOGLE_CLIENT_SECRET!.trim(),
    refresh_token: connection.refresh_token,
    grant_type: "refresh_token",
  });

  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    : null;

  const admin = createAdminClient();
  await admin
    .from("gmail_connections")
    .update({
      access_token: tokens.access_token,
      token_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", connection.id);

  return { accessToken: tokens.access_token, expiresAt };
}

async function accessTokenFor(connection: GmailConnectionRow): Promise<string> {
  const expires = connection.token_expires_at
    ? Date.parse(connection.token_expires_at)
    : 0;
  if (expires - Date.now() > 60_000) {
    return connection.access_token;
  }
  const refreshed = await refreshAccessToken(connection);
  return refreshed.accessToken;
}

async function gmailFetch(
  accessToken: string,
  path: string
): Promise<Response> {
  return fetch(`${GMAIL_API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function fetchGmailProfile(accessToken: string): Promise<string> {
  const res = await gmailFetch(accessToken, "/profile");
  const json = (await res.json()) as { emailAddress?: string; error?: { message?: string } };
  if (!res.ok || !json.emailAddress) {
    throw new Error(json.error?.message ?? "Could not read your Gmail address.");
  }
  return json.emailAddress;
}

export async function saveGmailConnection(input: {
  householdId: string;
  userId: string;
  gmailAddress: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}): Promise<void> {
  const admin = createAdminClient();
  const expiresAt = new Date(Date.now() + input.expiresIn * 1000).toISOString();
  const now = new Date().toISOString();

  const { error } = await admin.from("gmail_connections").upsert(
    {
      household_id: input.householdId,
      user_id: input.userId,
      gmail_address: input.gmailAddress,
      access_token: input.accessToken,
      refresh_token: input.refreshToken,
      token_expires_at: expiresAt,
      last_scan_error: null,
      updated_at: now,
    },
    { onConflict: "household_id" }
  );
  if (error) throw new Error(error.message);
}

export async function loadGmailConnection(
  householdId: string
): Promise<GmailConnectionRow | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("gmail_connections")
    .select("*")
    .eq("household_id", householdId)
    .maybeSingle();
  return (data as GmailConnectionRow | null) ?? null;
}

export async function loadGmailConnectionPublic(
  householdId: string
): Promise<GmailConnectionPublic | null> {
  const row = await loadGmailConnection(householdId);
  if (!row) return null;
  return {
    id: row.id,
    gmailAddress: row.gmail_address,
    connectedAt: row.created_at ?? new Date().toISOString(),
    lastScanAt: row.last_scan_at,
    lastScanError: row.last_scan_error,
  };
}

export async function disconnectGmail(householdId: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("gmail_connections")
    .delete()
    .eq("household_id", householdId);
  if (error) throw new Error(error.message);
}

function scanAfterDate(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - SCAN_MONTHS);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;
}

function headerValue(headers: GmailHeader[] | undefined, name: string): string | null {
  const hit = headers?.find((h) => h.name.toLowerCase() === name.toLowerCase());
  return hit?.value ?? null;
}

function collectPdfParts(
  part: GmailMessagePart,
  out: Array<{ attachmentId: string; filename: string }>
): void {
  const filename = part.filename?.trim() ?? "";
  const attachmentId = part.body?.attachmentId;
  const isPdf =
    part.mimeType === "application/pdf" || filename.toLowerCase().endsWith(".pdf");

  if (attachmentId && isPdf && filename) {
    out.push({ attachmentId, filename });
  }
  for (const child of part.parts ?? []) {
    collectPdfParts(child, out);
  }
}

export type ScanResult = {
  found: number;
  inserted: number;
  error?: string;
};

export async function scanGmailForCandidates(
  householdId: string
): Promise<ScanResult> {
  const admin = createAdminClient();
  const connection = await loadGmailConnection(householdId);
  if (!connection) {
    return { found: 0, inserted: 0, error: "No Gmail account is connected." };
  }

  const accessToken = await accessTokenFor(connection);
  const after = scanAfterDate();
  const query = `has:attachment filename:pdf after:${after}`;

  const messageIds: string[] = [];
  let pageToken: string | undefined;

  try {
    do {
      const params = new URLSearchParams({
        q: query,
        maxResults: "50",
      });
      if (pageToken) params.set("pageToken", pageToken);

      const listRes = await gmailFetch(accessToken, `/messages?${params.toString()}`);
      const listJson = (await listRes.json()) as GmailMessageList & {
        error?: { message?: string };
      };
      if (!listRes.ok) {
        throw new Error(listJson.error?.message ?? "Could not list Gmail messages.");
      }

      for (const msg of listJson.messages ?? []) {
        messageIds.push(msg.id);
        if (messageIds.length >= MAX_MESSAGES) break;
      }
      pageToken = messageIds.length >= MAX_MESSAGES ? undefined : listJson.nextPageToken;
    } while (pageToken && messageIds.length < MAX_MESSAGES);

    const rows: Array<Record<string, unknown>> = [];

    for (const messageId of messageIds) {
      const msgRes = await gmailFetch(
        accessToken,
        `/messages/${messageId}?format=full`
      );
      const message = (await msgRes.json()) as GmailMessage;
      if (!msgRes.ok) continue;

      const attachments: Array<{ attachmentId: string; filename: string }> = [];
      if (message.payload) {
        collectPdfParts(message.payload, attachments);
      }

      if (attachments.length === 0) continue;

      const subject = headerValue(message.payload?.headers, "Subject");
      const sender = headerValue(message.payload?.headers, "From");
      const receivedAt = message.internalDate
        ? new Date(Number(message.internalDate)).toISOString()
        : null;
      const haystack = `${subject ?? ""} ${sender ?? ""}`;

      for (const attachment of attachments) {
        const suggested = categoriseFromText(
          `${haystack} ${attachment.filename}`
        );
        rows.push({
          household_id: householdId,
          connection_id: connection.id,
          gmail_message_id: messageId,
          gmail_attachment_id: attachment.attachmentId,
          filename: attachment.filename.slice(0, 300),
          subject: subject?.slice(0, 500) ?? null,
          sender: sender?.slice(0, 300) ?? null,
          received_at: receivedAt,
          suggested_category: suggested,
          status: "pending",
        });
      }
    }

    let inserted = 0;
    if (rows.length > 0) {
      const { data, error } = await admin
        .from("gmail_import_candidates")
        .upsert(rows, {
          onConflict: "connection_id,gmail_message_id,gmail_attachment_id",
          ignoreDuplicates: true,
        })
        .select("id");
      if (error) throw new Error(error.message);
      inserted = data?.length ?? 0;
    }

    await admin
      .from("gmail_connections")
      .update({
        last_scan_at: new Date().toISOString(),
        last_scan_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", connection.id);

    return { found: rows.length, inserted };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Gmail scan failed.";
    await admin
      .from("gmail_connections")
      .update({
        last_scan_error: message.slice(0, 500),
        updated_at: new Date().toISOString(),
      })
      .eq("id", connection.id);
    return { found: 0, inserted: 0, error: message };
  }
}

export async function loadPendingCandidates(
  householdId: string
): Promise<GmailImportCandidateRow[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("gmail_import_candidates")
    .select("*")
    .eq("household_id", householdId)
    .eq("status", "pending")
    .order("received_at", { ascending: false });
  return (data as GmailImportCandidateRow[] | null) ?? [];
}

export async function downloadGmailAttachment(input: {
  connection: GmailConnectionRow;
  messageId: string;
  attachmentId: string;
}): Promise<Buffer> {
  const accessToken = await accessTokenFor(input.connection);
  const res = await gmailFetch(
    accessToken,
    `/messages/${input.messageId}/attachments/${input.attachmentId}`
  );
  const json = (await res.json()) as { data?: string; error?: { message?: string } };
  if (!res.ok || !json.data) {
    throw new Error(json.error?.message ?? "Could not download the attachment.");
  }
  return Buffer.from(json.data, "base64url");
}
