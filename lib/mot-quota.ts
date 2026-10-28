import "server-only";

import { createAdminClient } from "@/lib/supabase-admin";

/* The durable half of the MOT lookup throttle. lib/rate-limit.ts blunts
 * bursts but lives in one isolate's memory; the daily caps have to survive a
 * cold start, so they're counted in Postgres (public.mot_lookup_daily_usage,
 * via the service-role-only public.consume_mot_lookup RPC). Days are UTC. */

export const DEFAULT_MOT_USER_DAILY_LIMIT = 20;
export const DEFAULT_MOT_GLOBAL_DAILY_LIMIT = 500;

export type MotQuotaResult = "ok" | "user_limit" | "global_limit" | "unavailable";

function positiveIntFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export function motDailyLimits(): { user: number; global: number } {
  return {
    user: positiveIntFromEnv("MOT_LOOKUP_USER_DAILY_LIMIT", DEFAULT_MOT_USER_DAILY_LIMIT),
    global: positiveIntFromEnv("MOT_LOOKUP_GLOBAL_DAILY_LIMIT", DEFAULT_MOT_GLOBAL_DAILY_LIMIT),
  };
}

/**
 * Counts one MOT lookup against today's per-user and global caps, or refuses
 * it. Anything that stops the counter answering (no service-role key, the
 * migration not applied, a network blip) is "unavailable" — the caller fails
 * closed rather than spending DVSA quota it can't account for.
 */
export async function consumeMotLookup(userId: string): Promise<MotQuotaResult> {
  const limits = motDailyLimits();
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("consume_mot_lookup", {
      p_user_id: userId,
      p_user_limit: limits.user,
      p_global_limit: limits.global,
    });
    if (error) {
      console.error("[vehicle/mot] daily cap check failed", error.message);
      return "unavailable";
    }
    if (data === "ok" || data === "user_limit" || data === "global_limit") return data;
    console.error("[vehicle/mot] daily cap check returned", data);
    return "unavailable";
  } catch (error) {
    console.error("[vehicle/mot] daily cap check threw", error);
    return "unavailable";
  }
}
