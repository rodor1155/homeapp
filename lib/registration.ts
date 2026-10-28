/* UK vehicle registrations, normalised and checked the same way on both sides
 * of the MOT lookup — the Add to house sheet refuses a bad one inline, and
 * POST /api/vehicle/mot refuses it with a 400 before DVSA is ever called.
 * Client-safe on purpose: lib/mot.ts is server-only. */

const REGISTRATION_PATTERN = /^[A-Z0-9]{2,8}$/;

/** Shown inline by the sheet and returned as the route's 400 `error`. */
export const INVALID_REGISTRATION_MESSAGE =
  "Enter a registration of 2 to 8 letters and numbers, like FX74 YGF.";

/** "ab-12 cde" → "AB12CDE". Null if what's left isn't 2–8 letters/digits. */
export function normaliseRegistration(raw: string): string | null {
  const registration = raw.replace(/[\s-]+/g, "").toUpperCase();
  return REGISTRATION_PATTERN.test(registration) ? registration : null;
}
