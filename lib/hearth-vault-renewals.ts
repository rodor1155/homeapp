"use client";

import { getNativePlugin } from "@/lib/native-plugin";
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

export type AddRenewalResult = {
  ok: boolean;
  needsPaywall?: boolean;
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
  return getNativePlugin<HearthVaultRenewalsPlugin>("HearthVault");
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
  const plugin = renewalsPlugin();
  if (!plugin?.addRenewalFromPreset) {
    return { ok: false };
  }
  try {
    return (await plugin.addRenewalFromPreset({ presetId })) ?? { ok: false };
  } catch {
    return { ok: false };
  }
}

export async function confirmRenewalDraft(
  draft: RenewalDraftInput
): Promise<AddRenewalResult> {
  const plugin = renewalsPlugin();
  if (!plugin?.confirmRenewalDraft) {
    return { ok: false };
  }
  try {
    return (await plugin.confirmRenewalDraft({ draft })) ?? { ok: false };
  } catch {
    return { ok: false };
  }
}
