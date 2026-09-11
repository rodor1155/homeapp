// Guest pack fields hanging off households. Client-safe shape + loader.

import type { SupabaseClient } from "@supabase/supabase-js";

export type GuestPack = {
  wifi_name: string | null;
  wifi_password: string | null;
  spare_key_note: string | null;
  bin_day_note: string | null;
  school_run_note: string | null;
};

export const GUEST_PACK_SELECT =
  "wifi_name, wifi_password, spare_key_note, bin_day_note, school_run_note";

export async function loadGuestPack(
  supabase: SupabaseClient,
  householdId: string
): Promise<{ pack: GuestPack | null; fault: string | null }> {
  const { data, error } = await supabase
    .from("households")
    .select(GUEST_PACK_SELECT)
    .eq("id", householdId)
    .maybeSingle();
  if (error) {
    console.error("[guests] loadGuestPack", error.message);
    return {
      pack: null,
      fault: "We couldn’t load the guest notes just now.",
    };
  }
  return { pack: (data as GuestPack | null) ?? null, fault: null };
}

export function guestPackHasAnything(pack: GuestPack | null): boolean {
  if (!pack) return false;
  return Boolean(
    pack.wifi_name ||
      pack.wifi_password ||
      pack.spare_key_note ||
      pack.bin_day_note ||
      pack.school_run_note
  );
}
