"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchVaultDeckCards,
  type VaultDeckCard,
} from "@/lib/hearth-vault-renewals";
import { hasNativeVault } from "@/lib/native-vault";

export function useVaultDeckCards(): {
  cards: VaultDeckCard[];
  refresh: () => void;
} {
  const [cards, setCards] = useState<VaultDeckCard[]>([]);

  const refresh = useCallback(() => {
    if (!hasNativeVault()) {
      setCards([]);
      return;
    }
    void fetchVaultDeckCards().then(setCards);
  }, []);

  useEffect(() => {
    refresh();
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  return { cards, refresh };
}
