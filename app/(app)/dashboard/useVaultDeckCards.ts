"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchVaultDeckCards,
  type VaultDeckCard,
} from "@/lib/hearth-vault-renewals";
import { hasNativeVault } from "@/lib/native-vault";

export function useVaultDeckCards(): {
  cards: VaultDeckCard[];
  /** False until the first client fetch completes (avoids an empty-then-pop deck). */
  ready: boolean;
  refresh: () => void;
} {
  const [cards, setCards] = useState<VaultDeckCard[]>([]);
  const [ready, setReady] = useState(!hasNativeVault());

  const load = useCallback((opts?: { silent?: boolean }) => {
    if (!hasNativeVault()) {
      setCards([]);
      setReady(true);
      return;
    }
    if (!opts?.silent) {
      setReady(false);
    }
    void fetchVaultDeckCards().then((next) => {
      setCards(next);
      setReady(true);
    });
  }, []);

  useEffect(() => {
    load();
    const onFocus = () => load({ silent: true });
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  return { cards, ready, refresh: () => load({ silent: true }) };
}
