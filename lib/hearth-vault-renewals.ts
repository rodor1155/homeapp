"use client";

import { getNativePlugin } from "@/lib/native-plugin";
import { hasNativeVault } from "@/lib/native-vault";
import type { AtlasCardColor } from "@/lib/atlas-colors";
import type { HearthScanResult } from "@/lib/hearth-scan";
import type { HearthShareInDraft } from "@/lib/hearth-share-in";

/** One renewal row for the Home deck — sourced from the on-device vault. */
export type VaultDeckCard = {
  id: string;
  eyebrow: string;
  title: string;
  badge?: string;
  whenLabel: string;
  color: AtlasCardColor;
  bookLabel?: string;
  bookUrl?: string;
  position: number;
  total: number;
};

export type RenewalDraftInput = {
  presetId?: string;
  scan?: HearthScanResult;
  shareIn?: HearthShareInDraft;
  title?: string;
  expiryIso?: string;
};

export type AddRenewalFailureReason =
  | "missing_vault"
  | "missing_method"
  | "plugin_error"
  | "rejected";

export type AddRenewalResult = {
  ok: boolean;
  needsPaywall?: boolean;
  reason?: AddRenewalFailureReason;
  /** User-facing detail when ok is false. */
  message?: string;
};

export type HearthVaultRenewalsPlugin = {
  listDeckCards?: () => Promise<{ cards: VaultDeckCard[] }>;
  openRecord?: (options: { id: string }) => Promise<void>;
  bookRecord?: (options: { id: string }) => Promise<void>;
  addRenewalFromPreset?: (options: {
    presetId: string;
  }) => Promise<AddRenewalResult>;
  confirmRenewalDraft?: (options: {
    draft: RenewalDraftInput;
  }) => Promise<AddRenewalResult>;
};

function renewalsPlugin(): HearthVaultRenewalsPlugin | null {
  if (!hasNativeVault()) return null;
  return getNativePlugin<HearthVaultRenewalsPlugin>("HearthVault");
}

export function hasVaultRenewalPresets(): boolean {
  return typeof renewalsPlugin()?.addRenewalFromPreset === "function";
}

export function hasVaultConfirmDraft(): boolean {
  return typeof renewalsPlugin()?.confirmRenewalDraft === "function";
}

export async function fetchVaultDeckCards(): Promise<VaultDeckCard[]> {
  const plugin = renewalsPlugin();
  if (!plugin?.listDeckCards) return [];
  try {
    const result = await plugin.listDeckCards();
    return result.cards ?? [];
  } catch {
    return [];
  }
}

export async function openVaultRecord(id: string): Promise<boolean> {
  const plugin = renewalsPlugin();
  if (!plugin?.openRecord) return false;
  try {
    await plugin.openRecord({ id });
    return true;
  } catch {
    return false;
  }
}

export async function bookVaultRecord(id: string): Promise<boolean> {
  const plugin = renewalsPlugin();
  if (!plugin?.bookRecord) return false;
  try {
    await plugin.bookRecord({ id });
    return true;
  } catch {
    return false;
  }
}

export async function addRenewalFromPreset(
  presetId: string
): Promise<AddRenewalResult> {
  if (!hasNativeVault()) {
    return {
      ok: false,
      reason: "missing_vault",
      message:
        "Renewals are saved on your iPhone. Open Hearth from the App Store build, not the browser.",
    };
  }
  const plugin = renewalsPlugin();
  if (!plugin?.addRenewalFromPreset) {
    return {
      ok: false,
      reason: "missing_method",
      message:
        "This app build does not support preset renewals yet. Update the Hearth iPhone app, or add the renewal from the Vault tab.",
    };
  }
  try {
    const result = await plugin.addRenewalFromPreset({ presetId });
    if (result?.ok) return result;
    return {
      ok: false,
      reason: result?.reason ?? "rejected",
      needsPaywall: result?.needsPaywall,
      message:
        result?.message ??
        "Could not add this renewal on your phone. Try again from the Vault tab.",
    };
  } catch (error) {
    const message =
      (error as { message?: string })?.message ??
      "Something went wrong talking to the Vault on your phone.";
    return { ok: false, reason: "plugin_error", message };
  }
}

export async function confirmRenewalDraft(
  draft: RenewalDraftInput
): Promise<AddRenewalResult> {
  if (!hasNativeVault()) {
    return {
      ok: false,
      reason: "missing_vault",
      message: "Saving needs the Hearth iPhone app — nothing is sent to the server.",
    };
  }
  const plugin = renewalsPlugin();
  if (!plugin?.confirmRenewalDraft) {
    return {
      ok: false,
      reason: "missing_method",
      message:
        "This app build cannot save scanned renewals yet. Update the Hearth iPhone app.",
    };
  }
  try {
    const result = await plugin.confirmRenewalDraft({ draft });
    if (result?.ok) return result;
    return {
      ok: false,
      reason: result?.reason ?? "rejected",
      needsPaywall: result?.needsPaywall,
      message:
        result?.message ??
        "Could not save on your phone. Open the Vault tab and try again.",
    };
  } catch (error) {
    const message =
      (error as { message?: string })?.message ??
      "Something went wrong saving on your phone.";
    return { ok: false, reason: "plugin_error", message };
  }
}
