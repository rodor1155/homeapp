"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import Link from "next/link";
import {
  Backpack,
  Cake,
  CalendarDays,
  FileText,
  GraduationCap,
  RefreshCw,
  Repeat,
  Share2,
  Shuffle,
  type LucideIcon,
} from "lucide-react";
import {
  COMING_UP_TONE,
  type ComingUpEntry,
} from "@/lib/coming-up";
import { eveningCardWhen, eveningStackEntries, memberEdgeClass, type PersonSortable } from "@/lib/evening-map";
import type { Locale } from "@/lib/household";
import { TONE_PILL } from "@/lib/tones";
import EveningCardDetailOverlay, { type CardDetailRect } from "./EveningCardDetailOverlay";
import EveningComingUpSheet from "./EveningComingUpSheet";

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

const TAP_PX = 6;
const SWIPE_RATIO = 0.3;
const VELOCITY_PX_MS = 0.5;
const SPRING = "cubic-bezier(0.2, 0.9, 0.25, 1.15)";
const SHUFFLE_MS = 340;

const STACK_TRANSFORMS = [
  { y: 0, scale: 1, rotate: 0, opacity: 1, z: 30 },
  { y: -18, scale: 0.95, rotate: -2, opacity: 1, z: 20 },
  { y: -34, scale: 0.9, rotate: 2.5, opacity: 1, z: 10 },
] as const;

/** Headroom above peek translateY for rotated corner lift (bottom-center origin). */
const PEEK_ROTATION_LIFT_PX = 8;

function subscribeReducedMotion(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

function clientReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function EveningDeckCard({
  entry,
  edge,
  locale,
  stackIndex,
  isFront,
  dragX,
  dragRotate,
  exiting,
  crossfading,
  reducedMotion,
  cardRef,
  onFrontPointerDown,
  onFrontPointerMove,
  onFrontPointerUp,
  onFrontPointerCancel,
}: {
  entry: ComingUpEntry;
  edge: string;
  locale: Locale;
  stackIndex: number;
  isFront: boolean;
  dragX: number;
  dragRotate: number;
  exiting: "left" | "right" | null;
  crossfading?: boolean;
  reducedMotion: boolean;
  cardRef?: React.RefObject<HTMLDivElement | null>;
  onFrontPointerDown?: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onFrontPointerMove?: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onFrontPointerUp?: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onFrontPointerCancel?: (e: ReactPointerEvent<HTMLDivElement>) => void;
}) {
  const Icon = COMING_UP_ICON[entry.kind] ?? CalendarDays;
  const tone = TONE_PILL[COMING_UP_TONE[entry.kind]];
  const t = STACK_TRANSFORMS[stackIndex] ?? STACK_TRANSFORMS[2];

  let transform = `translateY(${t.y}px) scale(${t.scale}) rotate(${t.rotate}deg)`;
  let opacity = crossfading ? 0 : t.opacity;

  if (isFront && !reducedMotion) {
    if (exiting === "left") {
      transform = `translateX(-120%) rotate(-18deg)`;
      opacity = 0;
    } else if (exiting === "right") {
      transform = `translateX(120%) rotate(18deg)`;
      opacity = 0;
    } else if (dragX !== 0) {
      transform = `translateX(${dragX}px) rotate(${dragRotate}deg)`;
    }
  }

  const surfaceClass = isFront
    ? "evening-glass-card-front"
    : stackIndex === 1
      ? "evening-glass-card-peek-near"
      : "evening-glass-card-peek-far";

  return (
    <div
      ref={isFront ? cardRef : undefined}
      data-evening-deck-card={isFront ? "front" : stackIndex}
      className={`evening-card evening-card-front evening-glass-card ${surfaceClass} ${edge}${isFront ? " evening-card--front evening-card--interactive" : " evening-card--back"}${isFront && !reducedMotion ? " touch-none" : ""}`}
      style={{
        zIndex: t.z,
        opacity,
        transform,
        pointerEvents: isFront ? "auto" : "none",
        willChange: isFront && (dragX !== 0 || exiting) ? "transform, opacity" : undefined,
        transition:
          isFront && (exiting || (dragX === 0 && !reducedMotion))
            ? `transform ${SHUFFLE_MS}ms ${SPRING}, opacity ${SHUFFLE_MS * 0.85}ms ease-out`
            : !isFront && !reducedMotion
              ? `transform ${SHUFFLE_MS}ms ${SPRING}, opacity ${SHUFFLE_MS * 0.85}ms ease-out`
              : undefined,
      }}
      onPointerDown={isFront ? onFrontPointerDown : undefined}
      onPointerMove={isFront ? onFrontPointerMove : undefined}
      onPointerUp={isFront ? onFrontPointerUp : undefined}
      onPointerCancel={isFront ? onFrontPointerCancel : undefined}
    >
      {!isFront ? (
        <div className="evening-card-ghost" aria-hidden>
          <span className="evening-card-ghost-icon" />
          <div className="evening-card-ghost-lines">
            <span className="evening-card-ghost-bar evening-card-ghost-bar--title" />
            <span className="evening-card-ghost-bar" />
          </div>
        </div>
      ) : null}

      <div
        className="evening-card-content"
        aria-hidden={!isFront}
      >
        <div className="evening-card-row">
          <span
            aria-hidden
            className={`icon-well evening-card-icon ${tone}`}
          >
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
  );
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
  const stack = eveningStackEntries(entries, 6);
  const stackFingerprint = stack.map((e) => `${e.key}:${e.date}`).join("|");

  const [deckRotation, setDeckRotation] = useState(0);
  const [prevStackFingerprint, setPrevStackFingerprint] =
    useState(stackFingerprint);

  if (prevStackFingerprint !== stackFingerprint) {
    setPrevStackFingerprint(stackFingerprint);
    setDeckRotation(0);
  }

  const [sheetOpen, setSheetOpen] = useState(false);
  const [detailEntry, setDetailEntry] = useState<ComingUpEntry | null>(null);
  const [detailRect, setDetailRect] = useState<CardDetailRect | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [exiting, setExiting] = useState<"left" | "right" | null>(null);
  const [fadeKey, setFadeKey] = useState<string | null>(null);
  const [isShuffling, setIsShuffling] = useState(false);

  const deckRef = useRef<HTMLDivElement>(null);
  const frontCardRef = useRef<HTMLDivElement>(null);
  const frontFocusRef = useRef<HTMLDivElement>(null);
  const pointerStart = useRef<{ x: number; y: number; t: number } | null>(null);
  const pointerLast = useRef<{ x: number; t: number } | null>(null);
  const cardWidth = useRef(320);

  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    clientReducedMotion,
    () => true
  );

  const deckEntries =
    stack.length === 0
      ? []
      : (() => {
          const r =
            ((deckRotation % stack.length) + stack.length) % stack.length;
          return [...stack.slice(r), ...stack.slice(0, r)];
        })();

  const visible = deckEntries.slice(0, 3);
  const frontEntry = visible[0];
  const frontEntryKey = frontEntry?.key;
  const moreCount = Math.max(0, deckEntries.length - 3);

  const measureCardWidth = useCallback(() => {
    const w = frontCardRef.current?.offsetWidth;
    if (w) cardWidth.current = w;
  }, []);

  useEffect(() => {
    measureCardWidth();
    window.addEventListener("resize", measureCardWidth);
    return () => window.removeEventListener("resize", measureCardWidth);
  }, [measureCardWidth, frontEntryKey]);

  const rotateDeck = () => {
    if (stack.length <= 1) return;
    setDeckRotation((r) => r + 1);
  };

  const finishShuffle = (direction: "left" | "right") => {
    if (isShuffling) return;
    setIsShuffling(true);

    if (reducedMotion) {
      setFadeKey(frontEntryKey ?? null);
      window.setTimeout(() => {
        rotateDeck();
        setFadeKey(null);
        setIsShuffling(false);
      }, 180);
      return;
    }

    setExiting(direction);
    window.setTimeout(() => {
      rotateDeck();
      setExiting(null);
      setDragX(0);
      setIsShuffling(false);
    }, SHUFFLE_MS);
  };

  const tryShuffle = (dx: number, velocity: number) => {
    const threshold = cardWidth.current * SWIPE_RATIO;
    if (Math.abs(dx) >= threshold || velocity >= VELOCITY_PX_MS) {
      finishShuffle(dx >= 0 ? "right" : "left");
      return true;
    }
    return false;
  };

  const openDetail = () => {
    const el = frontCardRef.current;
    if (!el || !frontEntry) return;
    const r = el.getBoundingClientRect();
    setDetailRect({
      top: r.top,
      left: r.left,
      width: r.width,
      height: r.height,
    });
    setDetailEntry(frontEntry);
    setDetailOpen(true);
  };

  const closeDetail = () => {
    setDetailOpen(false);
    setDetailEntry(null);
    setDetailRect(null);
  };

  const onFrontPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || isShuffling || detailOpen) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointerStart.current = { x: e.clientX, y: e.clientY, t: e.timeStamp };
    pointerLast.current = { x: e.clientX, t: e.timeStamp };
    setDragX(0);
  };

  const onFrontPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointerStart.current || reducedMotion) return;
    const dx = e.clientX - pointerStart.current.x;
    setDragX(dx);
    pointerLast.current = { x: e.clientX, t: e.timeStamp };
    if (Math.abs(dx) > 8) e.preventDefault();
  };

  const onFrontPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointerStart.current) return;

    const dx = e.clientX - pointerStart.current.x;
    const dy = e.clientY - pointerStart.current.y;
    const dist = Math.hypot(dx, dy);

    let velocity = 0;
    if (pointerLast.current) {
      const dt = e.timeStamp - pointerLast.current.t;
      if (dt > 0) {
        velocity = Math.abs(e.clientX - pointerLast.current.x) / dt;
      }
    }

    pointerStart.current = null;
    pointerLast.current = null;

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* released */
    }

    if (dist < TAP_PX) {
      openDetail();
      setDragX(0);
      return;
    }

    if (!reducedMotion && tryShuffle(dx, velocity)) return;

    setDragX(0);
  };

  const onFrontPointerCancel = () => {
    pointerStart.current = null;
    pointerLast.current = null;
    setDragX(0);
  };

  const onShuffleClick = () => {
    if (deckEntries.length <= 1 || isShuffling) return;
    finishShuffle("right");
  };

  const onDeckKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (detailOpen) return;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      finishShuffle("left");
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      finishShuffle("right");
    }
  };

  const dragRotate =
    reducedMotion || dragX === 0
      ? 0
      : Math.max(-12, Math.min(12, dragX * 0.04));

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
      <div className="evening-card-stack">
        <div className="evening-deck-toolbar">
          <button
            type="button"
            className="evening-deck-see-all"
            aria-expanded={sheetOpen}
            aria-controls="evening-coming-up-sheet"
            onClick={() => setSheetOpen(true)}
          >
            See all
          </button>

          {moreCount > 0 ? (
            <span className="evening-deck-more" aria-live="polite">
              +{moreCount} more
            </span>
          ) : (
            <span aria-hidden className="evening-deck-more evening-deck-more--empty" />
          )}

          <button
            type="button"
            className="evening-deck-shuffle"
            aria-label="Next reminder"
            disabled={deckEntries.length <= 1 || isShuffling}
            onClick={onShuffleClick}
          >
            <Shuffle size={20} strokeWidth={2} aria-hidden />
          </button>
        </div>

        <div
          ref={deckRef}
          className="evening-deck"
          tabIndex={0}
          role="group"
          aria-label="Coming up reminders"
          onKeyDown={onDeckKeyDown}
        >
          <div
            ref={frontFocusRef}
            className="evening-deck-stage"
            style={{
              paddingTop:
                visible.length > 1
                  ? `${Math.abs(STACK_TRANSFORMS[visible.length - 1].y) + PEEK_ROTATION_LIFT_PX}px`
                  : undefined,
            }}
          >
            {[...visible].reverse().map((entry) => {
              const stackIndex = visible.findIndex((v) => v.key === entry.key);
              const isFront = stackIndex === 0;
              const edge = memberEdgeClass(entry.personId, people);

              return (
                <EveningDeckCard
                  key={entry.key}
                  entry={entry}
                  edge={edge}
                  locale={locale}
                  stackIndex={stackIndex}
                  isFront={isFront}
                  dragX={isFront ? dragX : 0}
                  dragRotate={isFront ? dragRotate : 0}
                  exiting={isFront ? exiting : null}
                  crossfading={isFront && fadeKey === entry.key}
                  reducedMotion={reducedMotion}
                  cardRef={isFront ? frontCardRef : undefined}
                  onFrontPointerDown={isFront ? onFrontPointerDown : undefined}
                  onFrontPointerMove={isFront ? onFrontPointerMove : undefined}
                  onFrontPointerUp={isFront ? onFrontPointerUp : undefined}
                  onFrontPointerCancel={isFront ? onFrontPointerCancel : undefined}
                />
              );
            })}
          </div>
        </div>
      </div>

      <EveningComingUpSheet
        id="evening-coming-up-sheet"
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        entries={entries}
        people={people}
        locale={locale}
      />

      <EveningCardDetailOverlay
        key={detailEntry?.key ?? "closed"}
        open={detailOpen}
        entry={detailEntry}
        locale={locale}
        originRect={detailRect}
        reducedMotion={reducedMotion}
        onClose={closeDetail}
        returnFocusRef={frontFocusRef}
      />
    </>
  );
}
