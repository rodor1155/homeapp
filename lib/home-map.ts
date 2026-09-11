import "server-only";

import { cache } from "react";
import { normalisePostcode } from "@/lib/address-lookup";

/* Soft street-map underlay for the home hero. Geocode from the UK postcode
   sitting in the property address (postcodes.io, no key), then point the
   browser at /api/home-map which stitches calm Carto Voyager tiles. If we
   cannot place the home, the hero keeps its sage wash and nobody notices. */

export type HomeMapPoint = {
  latitude: number;
  longitude: number;
  /** Absolute path the hero uses as a CSS background. */
  imagePath: string;
};

const FETCH_TIMEOUT_MS = 5_000;

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

    const { latitude, longitude } = point;
    const imagePath = `/api/home-map?lat=${latitude.toFixed(5)}&lng=${longitude.toFixed(5)}`;
    return { latitude, longitude, imagePath };
  }
);

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
