"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type RefObject,
} from "react";
import { CalendarDays } from "lucide-react";
import type { WeekAheadModel } from "@/lib/week-ahead";
import type { CardDetailRect } from "./EveningCardDetailOverlay";

const SPRING = "cubic-bezier(0.2, 0.9, 0.25, 1.15)";
const MORPH_MS = 300;
const FADE_MS = 180;
const DETAIL_MAX_W = 28 * 16;
const DETAIL_MAX_H_RATIO = 0.75;

export default function WeekAheadMorphOverlay({
  open,
  model,
  originRect,
  reducedMotion,
  onOpenSheet,
  onDone,
  returnFocusRef,
}: {
  open: boolean;
  model: WeekAheadModel | null;
  originRect: CardDetailRect | null;
  reducedMotion: boolean;
  onOpenSheet: () => void;
  onDone: () => void;
  returnFocusRef: RefObject<HTMLElement | null>;
}) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const openedRef = useRef(false);

  const finish = useCallback(() => {
    onDone();
    returnFocusRef.current?.focus();
  }, [onDone, returnFocusRef]);

  const openSheet = useCallback(() => {
    if (openedRef.current) return;
    openedRef.current = true;
    onOpenSheet();
    finish();
  }, [finish, onOpenSheet]);

  const runFlip = useCallback(
    (expand: boolean, rect: CardDetailRect, target: CardDetailRect) => {
      const panel = panelRef.current;
      if (!panel || reducedMotion) return;

      requestAnimationFrame(() => {
        const from = expand ? rect : target;
        const to = expand ? target : rect;

        const sx = from.width / to.width;
        const sy = from.height / to.height;
        const tx = from.left + from.width / 2 - (to.left + to.width / 2);
        const ty = from.top + from.height / 2 - (to.top + to.height / 2);

        panel.animate(
          [
            {
              transform: `translate(${tx}px, ${ty}px) scale(${sx}, ${sy})`,
              opacity: expand ? 0.92 : 1,
            },
            { transform: "translate(0, 0) scale(1, 1)", opacity: 1 },
          ],
          {
            duration: MORPH_MS,
            easing: SPRING,
            fill: "forwards",
          }
        );
      });
    },
    [reducedMotion]
  );

  useLayoutEffect(() => {
    if (!open || !model) return;
    openedRef.current = false;

    if (reducedMotion) {
      backdropRef.current?.animate([{ opacity: 0 }, { opacity: 0.35 }], {
        duration: FADE_MS,
        easing: "ease-out",
        fill: "forwards",
      });
      const timer = window.setTimeout(openSheet, FADE_MS);
      return () => window.clearTimeout(timer);
    }

    if (!originRect) {
      const timer = window.setTimeout(openSheet, MORPH_MS);
      return () => window.clearTimeout(timer);
    }

    backdropRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: MORPH_MS * 0.85,
      easing: "ease-out",
      fill: "forwards",
    });
    runFlip(true, originRect, targetRect());
    const timer = window.setTimeout(openSheet, MORPH_MS);
    return () => window.clearTimeout(timer);
  }, [model, open, openSheet, originRect, reducedMotion, runFlip]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        finish();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finish, open]);

  const panelStyle = open && model ? targetRect() : null;
  if (!open || !model || !panelStyle) return null;

  return (
    <div className="evening-detail-root" role="presentation" aria-hidden={false}>
      <div ref={backdropRef} className="evening-detail-backdrop" aria-hidden />

      <div
        role="status"
        aria-live="polite"
        aria-label={`Opening your week ahead`}
        className="evening-detail-dialog"
      >
        <div
          ref={panelRef}
          className={`evening-detail-panel evening-glass-card week-ahead-card week-ahead-card--morph ${
            reducedMotion ? "evening-detail-panel--fade" : ""
          }`}
          style={{
            top: panelStyle.top,
            left: panelStyle.left,
            width: panelStyle.width,
            maxHeight: panelStyle.height,
          }}
        >
          <div className="evening-detail-body px-4 pb-4 pt-4">
            <div className="evening-card-row">
              <span aria-hidden className="icon-well evening-card-icon tone-amber">
                <CalendarDays size={17} strokeWidth={1.9} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="evening-card-title">Your week ahead</p>
                <p className="evening-card-meta">{model.headline}</p>
                <p className="evening-card-when tnum">{model.rangeLabel}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function targetRect(): CardDetailRect {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(vw * 0.9, DETAIL_MAX_W);
  const height = Math.min(vh * DETAIL_MAX_H_RATIO, 420);
  const left = (vw - width) / 2;
  const tabBar =
    Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue(
        "--mobile-tab-bar-height"
      )
    ) || 72;
  const safeBottom = Math.max(
    12,
    Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue(
        "--safe-area-bottom"
      )
    ) || 0
  );
  const top = vh - height - tabBar - safeBottom - 16;
  return { top, left, width, height };
}
