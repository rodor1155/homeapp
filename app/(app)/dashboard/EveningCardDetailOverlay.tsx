"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type RefObject,
} from "react";
import { useRouter } from "next/navigation";
import {
  Backpack,
  Cake,
  CalendarDays,
  FileText,
  GraduationCap,
  RefreshCw,
  Repeat,
  Share2,
  type LucideIcon,
} from "lucide-react";
import {
  COMING_UP_TONE,
  type ComingUpEntry,
} from "@/lib/coming-up";
import { eveningCardWhen } from "@/lib/evening-map";
import type { Locale } from "@/lib/household";
import { TONE_PILL } from "@/lib/tones";

const COMING_UP_ICON: Record<string, LucideIcon> = {
  document: FileText,
  renewal: RefreshCw,
  birthday: Cake,
  event: CalendarDays,
  school: GraduationCap,
  shared: Share2,
  timetable: Backpack,
  routine: Repeat,
};

const SPRING = "cubic-bezier(0.2, 0.9, 0.25, 1.15)";
const MORPH_MS = 300;
const FADE_MS = 180;
const DETAIL_MAX_W = 28 * 16;
const DETAIL_MAX_H_RATIO = 0.75;

export type CardDetailRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

export default function EveningCardDetailOverlay({
  open,
  entry,
  locale,
  originRect,
  reducedMotion,
  href,
  onDone,
  returnFocusRef,
}: {
  open: boolean;
  entry: ComingUpEntry | null;
  locale: Locale;
  originRect: CardDetailRect | null;
  reducedMotion: boolean;
  href: string;
  onDone: () => void;
  returnFocusRef: RefObject<HTMLElement | null>;
}) {
  const router = useRouter();
  const backdropRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const navigatedRef = useRef(false);

  const panelStyle = open && entry ? targetRect() : null;

  const finish = useCallback(() => {
    onDone();
    returnFocusRef.current?.focus();
  }, [onDone, returnFocusRef]);

  const navigate = useCallback(() => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    router.push(href);
    finish();
  }, [finish, href, router]);

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
    if (!open || !entry) return;
    navigatedRef.current = false;

    if (reducedMotion) {
      backdropRef.current?.animate([{ opacity: 0 }, { opacity: 0.35 }], {
        duration: FADE_MS,
        easing: "ease-out",
        fill: "forwards",
      });
      const timer = window.setTimeout(navigate, FADE_MS);
      return () => window.clearTimeout(timer);
    }

    if (!originRect) {
      const timer = window.setTimeout(navigate, MORPH_MS);
      return () => window.clearTimeout(timer);
    }

    backdropRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: MORPH_MS * 0.85,
      easing: "ease-out",
      fill: "forwards",
    });
    runFlip(true, originRect, targetRect());
    const timer = window.setTimeout(navigate, MORPH_MS);
    return () => window.clearTimeout(timer);
  }, [entry, navigate, open, originRect, reducedMotion, runFlip]);

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

  if (!open || !entry || !panelStyle) return null;

  const Icon = COMING_UP_ICON[entry.kind] ?? CalendarDays;
  const tone = TONE_PILL[COMING_UP_TONE[entry.kind]];

  return (
    <div className="evening-detail-root" role="presentation" aria-hidden={false}>
      <div ref={backdropRef} className="evening-detail-backdrop" aria-hidden />

      <div
        role="status"
        aria-live="polite"
        aria-label={`Opening ${entry.title}`}
        className="evening-detail-dialog"
      >
        <div
          ref={panelRef}
          className={`evening-detail-panel evening-glass-card ${
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
              <span aria-hidden className={`icon-well evening-card-icon ${tone}`}>
                <Icon size={17} strokeWidth={1.9} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="evening-card-title">{entry.title}</p>
                <p className="evening-card-meta">{entry.note}</p>
                <p className="evening-card-when tnum">
                  {eveningCardWhen(entry, locale)}
                </p>
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
