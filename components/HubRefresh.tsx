"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const INTERVAL_MS = 60_000;

/** Keeps the hub read-mostly data fresh without a full page reload. */
export default function HubRefresh() {
  const router = useRouter();

  useEffect(() => {
    const id = window.setInterval(() => router.refresh(), INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [router]);

  return null;
}
