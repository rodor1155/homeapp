"use client";

import { useEffect } from "react";
import { clearOfflineCache } from "@/lib/clear-offline-cache";

/** Belt-and-braces: a signed-out visitor must not keep cached signed-in pages. */
export default function ClearOfflineCacheOnMount() {
  useEffect(() => {
    void clearOfflineCache();
  }, []);

  return null;
}
