import "server-only";

/* DVSA MOT History API — OAuth2 client-credentials token exchange, then a
 * per-registration GET with that bearer token plus a separate x-api-key.
 * DVSA's own docs ask callers to cache the access token rather than mint a
 * fresh one per lookup, so it's kept in memory (one Node isolate) until
 * shortly before it actually expires. */

const MOT_API_BASE =
  "https://history.mot.api.gov.uk/v1/trade/vehicles/registration";
const FETCH_TIMEOUT_MS = 8_000;
/** Refresh this long before the token's real expiry, to dodge races. */
const TOKEN_EARLY_REFRESH_MS = 60_000;

export type MotLookup =
  | {
      found: true;
      registration: string;
      make: string | null;
      model: string | null;
      colour: string | null;
      fuelType: string | null;
      /** ISO date (YYYY-MM-DD) of the current/most recent test's expiry, or null. */
      motExpiryDate: string | null;
      lastTestResult: string | null;
    }
  | { found: false };

export class MotLookupError extends Error {}

/** "fg11 vxy" and "FG11VXY" are the same lookup. */
export function normaliseRegistration(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

async function fetchWithTimeout(
  url: string,
  init: RequestInit
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt - TOKEN_EARLY_REFRESH_MS > Date.now()) {
    return cachedToken.accessToken;
  }

  const tokenUrl = process.env.DVSA_MOT_TOKEN_URL;
  const clientId = process.env.DVSA_MOT_CLIENT_ID;
  const clientSecret = process.env.DVSA_MOT_CLIENT_SECRET;
  const scope = process.env.DVSA_MOT_SCOPE_URL;
  if (!tokenUrl || !clientId || !clientSecret || !scope) {
    throw new MotLookupError("DVSA MOT credentials are not configured.");
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
        scope,
      }),
    });
  } catch {
    throw new MotLookupError("Could not reach the DVSA token service.");
  }

  if (!response.ok) {
    throw new MotLookupError(`DVSA token request failed (${response.status}).`);
  }

  const body = (await response.json().catch(() => null)) as {
    access_token?: unknown;
    expires_in?: unknown;
  } | null;
  const accessToken =
    typeof body?.access_token === "string" ? body.access_token : null;
  const expiresIn = typeof body?.expires_in === "number" ? body.expires_in : null;
  if (!accessToken || !expiresIn) {
    throw new MotLookupError("DVSA token response was not in the expected shape.");
  }

  cachedToken = { accessToken, expiresAt: Date.now() + expiresIn * 1000 };
  return accessToken;
}

type DvsaMotTest = {
  expiryDate?: unknown;
  testResult?: unknown;
};

type DvsaVehicleResponse = {
  make?: unknown;
  model?: unknown;
  primaryColour?: unknown;
  fuelType?: unknown;
  motTests?: unknown;
  /** Present instead of any motTests entries when the vehicle is too new
   * (under 3 years old) to have had its first MOT test yet. */
  motTestDueDate?: unknown;
};

function toIsoDate(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

/** Looks up a vehicle's MOT history. Never leaks the token or API key. */
export async function lookupMot(registrationRaw: string): Promise<MotLookup> {
  const registration = normaliseRegistration(registrationRaw);
  const apiKey = process.env.DVSA_MOT_API_KEY;
  if (!apiKey) {
    throw new MotLookupError("DVSA MOT credentials are not configured.");
  }

  const accessToken = await getAccessToken();

  let response: Response;
  try {
    response = await fetchWithTimeout(
      `${MOT_API_BASE}/${encodeURIComponent(registration)}`,
      {
        headers: {
          authorization: `Bearer ${accessToken}`,
          "x-api-key": apiKey,
          accept: "application/json",
        },
      }
    );
  } catch {
    throw new MotLookupError("Could not reach the DVSA MOT history service.");
  }

  if (response.status === 404) {
    return { found: false };
  }
  if (!response.ok) {
    throw new MotLookupError(`DVSA MOT lookup failed (${response.status}).`);
  }

  const body = (await response.json().catch(() => null)) as DvsaVehicleResponse | null;
  if (!body) {
    throw new MotLookupError("DVSA MOT response was not valid JSON.");
  }

  const tests = Array.isArray(body.motTests) ? (body.motTests as DvsaMotTest[]) : [];
  const latest = tests[0];

  return {
    found: true,
    registration,
    make: toStringOrNull(body.make),
    model: toStringOrNull(body.model),
    colour: toStringOrNull(body.primaryColour),
    fuelType: toStringOrNull(body.fuelType),
    // Vehicles under 3 years old have no tests yet — DVSA gives a due date
    // instead of an expiry date, and there's no result to report.
    motExpiryDate: latest ? toIsoDate(latest.expiryDate) : toIsoDate(body.motTestDueDate),
    lastTestResult: latest ? toStringOrNull(latest.testResult) : null,
  };
}
