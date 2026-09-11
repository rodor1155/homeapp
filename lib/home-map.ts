import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cache } from "react";
import { normalisePostcode } from "@/lib/address-lookup";

/* Soft street-map underlay for the home hero. Geocode from the UK postcode
   sitting in the property address (postcodes.io, no key), then point the
   browser at /api/home-map with a short-lived signed token so the stitch
   route never has to be left open. If we cannot place the home, the hero
   keeps its sage wash and nobody notices. */

export type HomeMapPoint = {
  latitude: number;
  longitude: number;
  /** Absolute path the hero uses as a CSS background. */
  imagePath: string;
};

const FETCH_TIMEOUT_MS = 5_000;
/** Token lifetime — long enough for a tab to stay open, short enough to blunt reuse. */
const TOKEN_TTL_MS = 6 * 60 * 60 * 1000;
/** Round coords so nearby homes share a stitch cache bucket. */
export const HOME_MAP_COORD_DECIMALS = 3;

/**
 * Where the home sits on a map, or null when the address has no UK postcode
 * we can place. Memoised for the request so the hero and anything else share
 * one lookup.
 */
export const resolveHomeMap = cache(
  async (address: string): Promise<HomeMapPoint | null> => {
    const postcode = extractUkPostcode(address);
    if (!postcode) return null;

    const point = await geocodePostcode(postcode);
    if (!point) return null;

    const latitude = roundCoord(point.latitude);
    const longitude = roundCoord(point.longitude);
    const token = mintHomeMapToken(latitude, longitude);
    const imagePath =
      `/api/home-map?lat=${latitude.toFixed(HOME_MAP_COORD_DECIMALS)}` +
      `&lng=${longitude.toFixed(HOME_MAP_COORD_DECIMALS)}` +
      `&t=${encodeURIComponent(token)}`;
    return { latitude, longitude, imagePath };
  }
);

export function roundCoord(value: number): number {
  const factor = 10 ** HOME_MAP_COORD_DECIMALS;
  return Math.round(value * factor) / factor;
}

/** Signing material: prefer an explicit secret, else the service-role key. */
function signingSecret(): string | null {
  return (
    process.env.HOME_MAP_SIGNING_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    null
  );
}

/**
 * Short-lived HMAC over rounded lat/lng. The API accepts this *or* a signed-in
 * session, so the hero can load without a second round trip while anonymous
 * stitch abuse stays closed.
 */
export function mintHomeMapToken(lat: number, lng: number, now = Date.now()): string {
  const secret = signingSecret();
  if (!secret) {
    // Without a secret the route falls back to session auth only.
    return "";
  }
  const exp = Math.floor((now + TOKEN_TTL_MS) / 1000);
  const payload = `${lat.toFixed(HOME_MAP_COORD_DECIMALS)}:${lng.toFixed(HOME_MAP_COORD_DECIMALS)}:${exp}`;
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${exp}.${sig}`;
}

export function verifyHomeMapToken(
  token: string,
  lat: number,
  lng: number,
  now = Date.now()
): boolean {
  const secret = signingSecret();
  if (!secret || !token) return false;
  const [expRaw, sig] = token.split(".");
  const exp = Number(expRaw);
  if (!expRaw || !sig || !Number.isFinite(exp)) return false;
  if (exp * 1000 < now) return false;

  const payload = `${lat.toFixed(HOME_MAP_COORD_DECIMALS)}:${lng.toFixed(HOME_MAP_COORD_DECIMALS)}:${exp}`;
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Pull the UK postcode out of a free-text address (often the last line). */
function extractUkPostcode(address: string): string | null {
  const lines = address
    .split(/\n|,/)
    .map((part) => part.trim())
    .filter(Boolean);

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const normalised = normalisePostcode(lines[i]!);
    if (normalised) return normalised;
  }

  // Last resort: scan the whole string for a postcode-shaped token.
  const match = address.toUpperCase().match(/\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/);
  return match ? normalisePostcode(match[1]!) : null;
}

type PostcodesIoBody = {
  result?: {
    latitude?: unknown;
    longitude?: unknown;
  };
};

async function geocodePostcode(
  postcode: string
): Promise<{ latitude: number; longitude: number } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`,
      {
        signal: controller.signal,
        headers: { accept: "application/json" },
        // Same postcode, same pin — keep it for a day.
        next: { revalidate: 86_400 },
      }
    );
    if (!response.ok) return null;
    const body = (await response.json()) as PostcodesIoBody;
    const latitude = body.result?.latitude;
    const longitude = body.result?.longitude;
    if (typeof latitude !== "number" || typeof longitude !== "number") {
      return null;
    }
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return { latitude, longitude };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
