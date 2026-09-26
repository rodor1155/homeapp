"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const REFRESH_MS = 15 * 60 * 1000;

/** Poll the server every 15 minutes so a kitchen tablet stays roughly current. */
export default function KidViewRefresh() {
  const router = useRouter();

  useEffect(() => {
    const id = window.setInterval(() => router.refresh(), REFRESH_MS);
    return () => window.clearInterval(id);
  }, [router]);

  return null;
}
