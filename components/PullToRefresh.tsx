"use client";

import {
  useCallback,
  useRef,
  useState,
  type ReactNode,
  type TouchEvent,
} from "react";
import { useRouter } from "next/navigation";

const THRESHOLD_PX = 64;
const MAX_PULL_PX = 96;

/**
 * Pull down from the top of the signed-in column to revalidate the current
 * route (router.refresh). Fresh data on demand without losing the Client
 * Cache for ordinary tab switches.
 */
export default function PullToRefresh({ children }: { children: ReactNode }) {
  const router = useRouter();
  const startY = useRef<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [offset, setOffset] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const reset = useCallback(() => {
    startY.current = null;
    setDragging(false);
    setOffset(0);
  }, []);

  const onTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (refreshing) return;
    if (typeof window !== "undefined" && window.scrollY > 0) return;
    startY.current = event.touches[0]?.clientY ?? null;
    setDragging(true);
  };

  const onTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    if (startY.current == null || refreshing) return;
    if (typeof window !== "undefined" && window.scrollY > 0) {
      reset();
      return;
    }
    const y = event.touches[0]?.clientY ?? startY.current;
    const delta = Math.max(0, y - startY.current);
    if (delta <= 0) {
      setOffset(0);
      return;
    }
    // Ease the rubber-band so it never feels stuck open.
    setOffset(Math.min(MAX_PULL_PX, delta * 0.45));
  };

  const onTouchEnd = () => {
    if (!dragging) return;
    const shouldRefresh = offset >= THRESHOLD_PX && !refreshing;
    if (!shouldRefresh) {
      reset();
      return;
    }
    setRefreshing(true);
    setDragging(false);
    setOffset(THRESHOLD_PX * 0.6);
    router.refresh();
    // refresh() is fire-and-forget; give the RSC stream a moment, then settle.
    window.setTimeout(() => {
      setRefreshing(false);
      setOffset(0);
      startY.current = null;
    }, 900);
  };

  const label = refreshing
    ? "Refreshing…"
    : offset >= THRESHOLD_PX
      ? "Release to refresh"
      : offset > 12
        ? "Pull to refresh"
        : "";

  return (
    <div
      className="relative"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={reset}
    >
      <div
        aria-hidden={offset < 8 && !refreshing}
        className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center"
        style={{
          transform: `translateY(${Math.max(0, offset - 28)}px)`,
          opacity: offset > 8 || refreshing ? 1 : 0,
          transition: dragging ? "none" : "opacity 150ms ease",
        }}
      >
        <span className="rounded-pill bg-paper-raised/95 px-3 py-1 text-xs font-medium text-ink-soft shadow-sm ring-1 ring-rule">
          {label || "Pull to refresh"}
        </span>
      </div>
      <div
        style={{
          transform: offset ? `translateY(${offset}px)` : undefined,
          transition: dragging ? "none" : "transform 180ms ease",
        }}
      >
        {children}
      </div>
    </div>
  );
}
