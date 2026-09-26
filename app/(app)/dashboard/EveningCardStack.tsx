"use client";

import {
  useCallback,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
} from "react";
import Link from "next/link";
import type { ComingUpEntry } from "@/lib/coming-up";
import {
  detailFromComingUp,
  isTappableComingUp,
} from "@/lib/calendar-event-detail";
import {
  eveningCardWhen,
  eveningStackEntries,
  memberEdgeClass,
  type PersonSortable,
} from "@/lib/evening-map";
import type { Locale } from "@/lib/household";
import ComingUpTappableRow from "./ComingUpTappableRow";
import EveningComingUpSheet from "./EveningComingUpSheet";

const EXPAND_DRAG_PX = 40;

function EveningFrontCard({
  entry,
  edge,
  locale,
}: {
  entry: ComingUpEntry;
  edge: string;
  locale: Locale;
}) {
  return (
    <div
      className={`evening-card evening-card-front evening-glass-card ${edge}`}
      style={{ zIndex: 10 }}
    >
      <p className="evening-card-title">{entry.title}</p>
      <p className="evening-card-meta">{entry.note}</p>
      <p className="evening-card-when tnum">
        {eveningCardWhen(entry, locale)}
      </p>
    </div>
  );
}

function subscribeReducedMotion(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

function clientReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function EveningCardStack({
  entries,
  people,
  locale,
}: {
  entries: readonly ComingUpEntry[];
  people: readonly PersonSortable[];
  locale: Locale;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const stack = eveningStackEntries(entries, 6);
  const visible = stack.slice(0, 3);
  const frontEntry = visible[visible.length - 1];
  const peekEntries = visible.slice(0, -1).slice(-2);
  const peekReservePx =
    peekEntries.length === 2 ? 14 : peekEntries.length === 1 ? 7 : 0;

  const dragStartY = useRef<number | null>(null);
  const dragOpened = useRef(false);
  const isDragging = useRef(false);

  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    clientReducedMotion,
    () => true
  );

  const openSheet = useCallback(() => setSheetOpen(true), []);
  const closeSheet = useCallback(() => setSheetOpen(false), []);

  const resetDrag = useCallback(() => {
    dragStartY.current = null;
    isDragging.current = false;
    dragOpened.current = false;
    setDragOffset(0);
  }, []);

  const beginDrag = useCallback(
    (clientY: number) => {
      dragStartY.current = clientY;
      isDragging.current = true;
      dragOpened.current = false;
      setDragOffset(0);
    },
    []
  );

  const moveDrag = useCallback(
    (clientY: number) => {
      if (dragStartY.current === null) return;
      const delta = dragStartY.current - clientY;
      if (delta <= 0) {
        setDragOffset(0);
        return;
      }
      if (!reducedMotion) {
        setDragOffset(Math.min(delta, EXPAND_DRAG_PX * 1.5));
      }
      if (delta >= EXPAND_DRAG_PX && !dragOpened.current) {
        dragOpened.current = true;
        openSheet();
      }
    },
    [openSheet, reducedMotion]
  );

  const endDrag = useCallback(() => {
    resetDrag();
  }, [resetDrag]);

  const onDragZonePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("[data-evening-front-card]")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    beginDrag(e.clientY);
  };

  const onDragZonePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;
    const delta =
      dragStartY.current === null ? 0 : dragStartY.current - e.clientY;
    moveDrag(e.clientY);
    if (delta > 0) e.preventDefault();
  };

  const onDragZonePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    endDrag();
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  };

  const onHandleClick = () => {
    if (dragOpened.current) {
      dragOpened.current = false;
      return;
    }
    openSheet();
  };

  const frontEdge = frontEntry
    ? memberEdgeClass(frontEntry.personId, people)
    : "evening-edge-neutral";
  const frontRenewalId =
    frontEntry?.kind === "renewal" ? frontEntry.renewalId : undefined;
  const frontTappable =
    frontEntry && !frontRenewalId ? isTappableComingUp(frontEntry) : false;
  const frontDetail =
    frontEntry && frontTappable ? detailFromComingUp(frontEntry) : null;

  if (stack.length === 0) {
    return (
      <div className="evening-card-stack">
        <div className="evening-card evening-glass-card evening-edge-neutral">
          <p className="evening-card-title">All clear</p>
          <p className="evening-card-meta">
            Nothing coming up — add a date or a reminder
          </p>
          <Link href="/calendar" className="evening-file-pill evening-glass mt-3">
            Add a date
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className="evening-card-stack"
        style={
          dragOffset > 0 && !reducedMotion
            ? { transform: `translateY(-${dragOffset}px)` }
            : undefined
        }
      >
        <div
          className="evening-stack-drag-zone touch-none"
          onPointerDown={onDragZonePointerDown}
          onPointerMove={onDragZonePointerMove}
          onPointerUp={onDragZonePointerUp}
          onPointerCancel={onDragZonePointerUp}
        >
          <button
            type="button"
            className="evening-stack-handle"
            aria-expanded={sheetOpen}
            aria-controls="evening-coming-up-sheet"
            onClick={onHandleClick}
          >
            <span aria-hidden className="h-1 w-9 rounded-pill bg-white/25" />
            See all
          </button>

          <div
            className="relative"
            style={
              peekReservePx > 0 ? { paddingTop: `${peekReservePx}px` } : undefined
            }
          >
            {peekEntries.map((entry, index) => {
              const depth = peekEntries.length - index;
              const peekOffset = depth === 1 ? 7 : 14;
              const scale = depth === 1 ? 0.95 : 0.9;
              const peekTone = depth === 1 ? "near" : "far";

              return (
                <div
                  key={entry.key}
                  aria-hidden
                  className={`evening-card evening-card-peek evening-card-peek--${peekTone} absolute inset-x-0 top-0`}
                  style={{
                    transform: `translateY(-${peekOffset}px) scale(${scale})`,
                    zIndex: 8 + index,
                    pointerEvents: "none",
                  }}
                />
              );
            })}

            {frontEntry ? (
              <div data-evening-front-card className="relative z-10">
                {frontTappable && frontDetail ? (
                  <ComingUpTappableRow
                    detail={frontDetail}
                    locale={locale}
                    className="block w-full text-left"
                  >
                    <EveningFrontCard
                      entry={frontEntry}
                      edge={frontEdge}
                      locale={locale}
                    />
                  </ComingUpTappableRow>
                ) : frontRenewalId ? (
                  <Link
                    href={`/family?renewal=${frontRenewalId}#renewals`}
                    className="block w-full text-left"
                  >
                    <EveningFrontCard
                      entry={frontEntry}
                      edge={frontEdge}
                      locale={locale}
                    />
                  </Link>
                ) : (
                  <EveningFrontCard
                    entry={frontEntry}
                    edge={frontEdge}
                    locale={locale}
                  />
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <EveningComingUpSheet
        id="evening-coming-up-sheet"
        open={sheetOpen}
        onClose={closeSheet}
        entries={entries}
        people={people}
        locale={locale}
      />
    </>
  );
}
