"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Backpack,
  Cake,
  CalendarDays,
  ChevronRight,
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
  comingUpHref,
  type ComingUpEntry,
} from "@/lib/coming-up";
import {
  cardTintForEntry,
  eveningCardWhen,
  eveningStackEntries,
  memberEdgeClass,
  type PersonSortable,
} from "@/lib/evening-map";
import type { Locale } from "@/lib/household";
import { TONE_PILL } from "@/lib/tones";
import { memberColourStyle } from "@/lib/member-colours";
import {
  weekAheadCardTint,
  type WeekAheadModel,
} from "@/lib/week-ahead";
import EveningCardDetailOverlay, { type CardDetailRect } from "./EveningCardDetailOverlay";
import EveningComingUpSheet from "./EveningComingUpSheet";
import WeekAheadMorphOverlay from "./WeekAheadMorphOverlay";
import WeekAheadSheet from "./WeekAheadSheet";

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
  { y: 0, scale: 1, rotate: 0, opacity: 1, z: 30, peekBand: 0 },
  { y: -26, scale: 0.94, rotate: -2.5, opacity: 1, z: 20, peekBand: 26 },
  { y: -50, scale: 0.88, rotate: 2.5, opacity: 1, z: 10, peekBand: 24 },
] as const;

const DECK_PEEK_HEADROOM =
  "calc(var(--deck-peek-offset-far) + var(--deck-peek-rotation-lift))";

/** Extra lift so peek bands clear the taller week-ahead front card. */
const WEEK_AHEAD_PEEK_LIFT = 80;

type StackTransform = {
  y: number;
  scale: number;
  rotate: number;
  opacity: number;
  z: number;
  peekBand: number;
};

function stackTransform(
  stackIndex: number,
  frontIsWeekAhead: boolean
): StackTransform {
  const base = STACK_TRANSFORMS[stackIndex] ?? STACK_TRANSFORMS[2];
  if (!frontIsWeekAhead || stackIndex === 0) return base;
  const lift =
    stackIndex === 1
      ? WEEK_AHEAD_PEEK_LIFT
      : Math.round(WEEK_AHEAD_PEEK_LIFT * 0.55);
  return {
    ...base,
    y: base.y - lift,
    peekBand: base.peekBand + lift,
  };
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

function EveningDeckCard({
  entry,
  edge,
  cardTint,
  locale,
  stackIndex,
  isFront,
  href,
  dragX,
  dragRotate,
  exiting,
  crossfading,
  reducedMotion,
  cardRef,
  onFrontClick,
  onFrontKeyDown,
  onFrontPointerDown,
  onFrontPointerMove,
  onFrontPointerUp,
  onFrontPointerCancel,
  frontIsWeekAhead,
}: {
  entry: ComingUpEntry;
  edge: string;
  cardTint: string;
  locale: Locale;
  stackIndex: number;
  isFront: boolean;
  frontIsWeekAhead: boolean;
  href: string | null;
  dragX: number;
  dragRotate: number;
  exiting: "left" | "right" | null;
  crossfading?: boolean;
  reducedMotion: boolean;
  cardRef?: React.RefObject<HTMLElement | null>;
  onFrontClick?: (e: ReactMouseEvent<HTMLAnchorElement>) => void;
  onFrontKeyDown?: (e: ReactKeyboardEvent<HTMLAnchorElement>) => void;
  onFrontPointerDown?: (e: ReactPointerEvent<HTMLElement>) => void;
  onFrontPointerMove?: (e: ReactPointerEvent<HTMLElement>) => void;
  onFrontPointerUp?: (e: ReactPointerEvent<HTMLElement>) => void;
  onFrontPointerCancel?: (e: ReactPointerEvent<HTMLElement>) => void;
}) {
  const Icon = COMING_UP_ICON[entry.kind] ?? CalendarDays;
  const tone = TONE_PILL[COMING_UP_TONE[entry.kind]];
  const t = stackTransform(stackIndex, frontIsWeekAhead);

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

  const cardBody = (
    <>
      {!isFront ? (
        <p className="evening-card-peek-title" aria-hidden>
          {entry.title}
        </p>
      ) : null}

      <div className="evening-card-content" aria-hidden={!isFront}>
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
    </>
  );

  const sharedProps = {
    "data-evening-deck-card": isFront ? "front" : stackIndex,
    className: `evening-card evening-card-front evening-glass-card ${surfaceClass} ${edge}${isFront ? " evening-card--front evening-card--interactive" : " evening-card--back"}${isFront && !reducedMotion ? " touch-none" : ""}`,
    style: {
      zIndex: t.z,
      opacity,
      transform,
      ["--card-tint" as string]: cardTint,
      ["--peek-band" as string]: t.peekBand ? `${t.peekBand}px` : undefined,
      pointerEvents: isFront ? ("auto" as const) : ("none" as const),
      willChange:
        isFront && (dragX !== 0 || exiting)
          ? ("transform, opacity" as const)
          : undefined,
      transition:
        isFront && (exiting || (dragX === 0 && !reducedMotion))
          ? `transform ${SHUFFLE_MS}ms ${SPRING}, opacity ${SHUFFLE_MS * 0.85}ms ease-out`
          : !isFront && !reducedMotion
            ? `transform ${SHUFFLE_MS}ms ${SPRING}, opacity ${SHUFFLE_MS * 0.85}ms ease-out`
            : undefined,
    },
  };

  if (isFront && href) {
    return (
      <Link
        ref={cardRef as React.RefObject<HTMLAnchorElement | null>}
        href={href}
        {...sharedProps}
        onClick={onFrontClick}
        onKeyDown={onFrontKeyDown}
        onPointerDown={onFrontPointerDown}
        onPointerMove={onFrontPointerMove}
        onPointerUp={onFrontPointerUp}
        onPointerCancel={onFrontPointerCancel}
      >
        {cardBody}
      </Link>
    );
  }

  if (isFront) {
    return (
      <div
        ref={cardRef as React.RefObject<HTMLDivElement | null>}
        {...sharedProps}
        onPointerDown={onFrontPointerDown}
        onPointerMove={onFrontPointerMove}
        onPointerUp={onFrontPointerUp}
        onPointerCancel={onFrontPointerCancel}
      >
        {cardBody}
      </div>
    );
  }

  return (
    <div {...sharedProps}>{cardBody}</div>
  );
}

type DeckItem =
  | { kind: "week-ahead"; key: string; model: WeekAheadModel }
  | { kind: "entry"; key: string; entry: ComingUpEntry };

function WeekAheadDeckCard({
  model,
  stackIndex,
  isFront,
  dragX,
  dragRotate,
  exiting,
  crossfading,
  reducedMotion,
  cardRef,
  onFrontClick,
  onFrontKeyDown,
  onFrontPointerDown,
  onFrontPointerMove,
  onFrontPointerUp,
  onFrontPointerCancel,
  frontIsWeekAhead,
}: {
  model: WeekAheadModel;
  stackIndex: number;
  isFront: boolean;
  frontIsWeekAhead: boolean;
  dragX: number;
  dragRotate: number;
  exiting: "left" | "right" | null;
  crossfading?: boolean;
  reducedMotion: boolean;
  cardRef?: React.RefObject<HTMLElement | null>;
  onFrontClick?: (e: ReactMouseEvent<HTMLButtonElement>) => void;
  onFrontKeyDown?: (e: ReactKeyboardEvent<HTMLButtonElement>) => void;
  onFrontPointerDown?: (e: ReactPointerEvent<HTMLElement>) => void;
  onFrontPointerMove?: (e: ReactPointerEvent<HTMLElement>) => void;
  onFrontPointerUp?: (e: ReactPointerEvent<HTMLElement>) => void;
  onFrontPointerCancel?: (e: ReactPointerEvent<HTMLElement>) => void;
}) {
  const t = stackTransform(stackIndex, frontIsWeekAhead);
  const cardTint = weekAheadCardTint();

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

  const sharedClass = `evening-card evening-card-front evening-glass-card week-ahead-card ${surfaceClass} evening-edge-neutral${isFront ? " evening-card--front evening-card--interactive" : " evening-card--back"}${isFront && !reducedMotion ? " touch-none" : ""}`;

  const style = {
    zIndex: t.z,
    opacity,
    transform,
    ["--card-tint" as string]: cardTint,
    ["--peek-band" as string]: t.peekBand ? `${t.peekBand}px` : undefined,
    pointerEvents: isFront ? ("auto" as const) : ("none" as const),
    willChange:
      isFront && (dragX !== 0 || exiting)
        ? ("transform, opacity" as const)
        : undefined,
    transition:
      isFront && (exiting || (dragX === 0 && !reducedMotion))
        ? `transform ${SHUFFLE_MS}ms ${SPRING}, opacity ${SHUFFLE_MS * 0.85}ms ease-out`
        : !isFront && !reducedMotion
          ? `transform ${SHUFFLE_MS}ms ${SPRING}, opacity ${SHUFFLE_MS * 0.85}ms ease-out`
          : undefined,
  };

  const cardBody = (
    <>
      {!isFront ? (
        <p className="evening-card-peek-title" aria-hidden>
          Your week ahead
        </p>
      ) : null}

      <div className="evening-card-content" aria-hidden={!isFront}>
        <div className="week-ahead-card-header evening-card-row">
          <span aria-hidden className="icon-well evening-card-icon tone-amber">
            <CalendarDays size={17} strokeWidth={1.9} />
          </span>
          <div className="min-w-0 flex-1 text-left">
            <p className="week-ahead-card-title">Your week ahead</p>
            <p className="week-ahead-card-range tnum">{model.rangeLabel}</p>
          </div>
        </div>
        <p className="week-ahead-card-headline">{model.headline}</p>
        {model.compactLines.length > 0 ? (
          <ul className="week-ahead-compact">
            {model.compactLines.map((line, i) => {
              if (line.kind === "person") {
                return (
                  <li key={`person-${line.personId}`} className="week-ahead-compact-line">
                    <span
                      className="week-ahead-person-chip"
                      style={memberColourStyle(line.colour)}
                    >
                      <span aria-hidden className="week-ahead-dot" />
                      <span className="truncate">{line.label}</span>
                    </span>
                  </li>
                );
              }
              return (
                <li
                  key={`${line.kind}-${i}`}
                  className="week-ahead-compact-line week-ahead-compact-line--muted"
                >
                  <span className="truncate">{line.label}</span>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </>
  );

  if (isFront) {
    return (
      <button
        ref={cardRef as React.RefObject<HTMLButtonElement | null>}
        type="button"
        data-evening-deck-card="front"
        className={sharedClass}
        style={style}
        aria-label={model.ariaLabel}
        onClick={onFrontClick}
        onKeyDown={onFrontKeyDown}
        onPointerDown={onFrontPointerDown}
        onPointerMove={onFrontPointerMove}
        onPointerUp={onFrontPointerUp}
        onPointerCancel={onFrontPointerCancel}
      >
        {cardBody}
      </button>
    );
  }

  return (
    <div
      data-evening-deck-card={stackIndex}
      className={sharedClass}
      style={style}
    >
      {cardBody}
    </div>
  );
}

export default function EveningCardStack({
  entries,
  deckEntries,
  people,
  locale,
  weekAhead = null,
  initialWeekSheetOpen = false,
  onWeekSheetClose,
}: {
  entries: readonly ComingUpEntry[];
  /** Entries for the swipeable fan; defaults to `entries`. */
  deckEntries?: readonly ComingUpEntry[];
  people: readonly PersonSortable[];
  locale: Locale;
  weekAhead?: WeekAheadModel | null;
  initialWeekSheetOpen?: boolean;
  onWeekSheetClose?: () => void;
}) {
  const fanSource = deckEntries ?? entries;
  const regularStack = eveningStackEntries(fanSource, 6);
  const stack: DeckItem[] = weekAhead
    ? [
        { kind: "week-ahead", key: "week-ahead", model: weekAhead },
        ...regularStack.map((entry) => ({
          kind: "entry" as const,
          key: entry.key,
          entry,
        })),
      ]
    : regularStack.map((entry) => ({
        kind: "entry" as const,
        key: entry.key,
        entry,
      }));
  const stackFingerprint = stack
    .map((item) =>
      item.kind === "week-ahead"
        ? `week-ahead:${item.model.range.monday}`
        : `${item.entry.key}:${item.entry.date}`
    )
    .join("|");

  const [deckRotation, setDeckRotation] = useState(0);
  const [prevStackFingerprint, setPrevStackFingerprint] =
    useState(stackFingerprint);

  if (prevStackFingerprint !== stackFingerprint) {
    setPrevStackFingerprint(stackFingerprint);
    setDeckRotation(0);
  }

  const [sheetOpen, setSheetOpen] = useState(false);
  const [weekSheetOpen, setWeekSheetOpen] = useState(initialWeekSheetOpen);
  const [weekMorphOpen, setWeekMorphOpen] = useState(false);
  const [weekMorphRect, setWeekMorphRect] = useState<CardDetailRect | null>(
    null
  );
  const [navEntry, setNavEntry] = useState<ComingUpEntry | null>(null);
  const [navHref, setNavHref] = useState<string | null>(null);
  const [detailRect, setDetailRect] = useState<CardDetailRect | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [exiting, setExiting] = useState<"left" | "right" | null>(null);
  const [fadeKey, setFadeKey] = useState<string | null>(null);
  const [isShuffling, setIsShuffling] = useState(false);

  const deckRef = useRef<HTMLDivElement>(null);
  const frontCardRef = useRef<HTMLElement>(null);
  const frontFocusRef = useRef<HTMLDivElement>(null);
  const pointerStart = useRef<{ x: number; y: number; t: number } | null>(null);
  const pointerLast = useRef<{ x: number; t: number } | null>(null);
  const cardWidth = useRef(320);

  const router = useRouter();
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    clientReducedMotion,
    () => true
  );

  const rotatedStack =
    stack.length === 0
      ? []
      : (() => {
          const r =
            ((deckRotation % stack.length) + stack.length) % stack.length;
          return [...stack.slice(r), ...stack.slice(0, r)];
        })();

  const visible = rotatedStack.slice(0, 3);
  const frontItem = visible[0];
  const frontEntryKey = frontItem?.key;
  const frontEntry =
    frontItem?.kind === "entry" ? frontItem.entry : undefined;
  const frontHref = frontEntry ? comingUpHref(frontEntry) : null;
  const frontIsWeekAhead = frontItem?.kind === "week-ahead";

  useEffect(() => {
    if (frontHref) router.prefetch(frontHref);
  }, [frontHref, router]);

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

  const startNavigate = (entry: ComingUpEntry, href: string) => {
    const el = frontCardRef.current;
    if (!el) {
      router.push(href);
      return;
    }
    const r = el.getBoundingClientRect();
    setDetailRect({
      top: r.top,
      left: r.left,
      width: r.width,
      height: r.height,
    });
    setNavEntry(entry);
    setNavHref(href);
    setNavOpen(true);
  };

  const startWeekAhead = () => {
    if (!weekAhead) return;
    const el = frontCardRef.current;
    if (!el || reducedMotion) {
      setWeekSheetOpen(true);
      return;
    }
    const r = el.getBoundingClientRect();
    setWeekMorphRect({
      top: r.top,
      left: r.left,
      width: r.width,
      height: r.height,
    });
    setWeekMorphOpen(true);
  };

  const closeWeekSheet = () => {
    setWeekSheetOpen(false);
    onWeekSheetClose?.();
  };

  const finishNavigate = () => {
    setNavOpen(false);
    setNavEntry(null);
    setNavHref(null);
    setDetailRect(null);
  };

  const onFrontPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0 || isShuffling || navOpen || weekMorphOpen) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointerStart.current = { x: e.clientX, y: e.clientY, t: e.timeStamp };
    pointerLast.current = { x: e.clientX, t: e.timeStamp };
    setDragX(0);
  };

  const onFrontPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    if (!pointerStart.current || reducedMotion) return;
    const dx = e.clientX - pointerStart.current.x;
    setDragX(dx);
    pointerLast.current = { x: e.clientX, t: e.timeStamp };
    if (Math.abs(dx) > 8) e.preventDefault();
  };

  const onFrontPointerUp = (e: ReactPointerEvent<HTMLElement>) => {
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
      if (frontIsWeekAhead) {
        startWeekAhead();
      } else if (frontEntry && frontHref) {
        startNavigate(frontEntry, frontHref);
      }
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
    if (rotatedStack.length <= 1 || isShuffling) return;
    finishShuffle("right");
  };

  const onFrontClick = (e: ReactMouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
  };

  const onFrontKeyDown = (
    e: ReactKeyboardEvent<HTMLAnchorElement | HTMLButtonElement>
  ) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (frontIsWeekAhead) {
      startWeekAhead();
      return;
    }
    if (!frontEntry || !frontHref) return;
    startNavigate(frontEntry, frontHref);
  };

  const onDeckKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (navOpen || weekMorphOpen) return;
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
          <div className="evening-deck-toolbar-actions">
            <button
              type="button"
              className="evening-deck-shuffle"
              aria-label="Next reminder"
              disabled={rotatedStack.length <= 1 || isShuffling}
              onClick={onShuffleClick}
            >
              <Shuffle size={20} strokeWidth={2} aria-hidden />
            </button>

            <button
              type="button"
              className="evening-deck-see-all-pill"
              aria-expanded={sheetOpen}
              aria-controls="evening-coming-up-sheet"
              onClick={() => setSheetOpen(true)}
            >
              See all ({entries.length})
              <ChevronRight size={18} strokeWidth={2} aria-hidden />
            </button>
          </div>
        </div>

        <div
          ref={deckRef}
          className="evening-deck"
          style={{
            ["--deck-peek-headroom" as string]:
              visible.length > 1
                ? frontIsWeekAhead
                  ? `calc(${DECK_PEEK_HEADROOM} + ${WEEK_AHEAD_PEEK_LIFT}px)`
                  : DECK_PEEK_HEADROOM
                : "0px",
          }}
          tabIndex={0}
          role="group"
          aria-label="Coming up reminders"
          onKeyDown={onDeckKeyDown}
        >
          <div ref={frontFocusRef} className="evening-deck-stage">
            {[...visible].reverse().map((item) => {
              const stackIndex = visible.findIndex((v) => v.key === item.key);
              const isFront = stackIndex === 0;

              if (item.kind === "week-ahead") {
                return (
                  <WeekAheadDeckCard
                    key={item.key}
                    model={item.model}
                    stackIndex={stackIndex}
                    isFront={isFront}
                    frontIsWeekAhead={frontIsWeekAhead}
                    dragX={isFront ? dragX : 0}
                    dragRotate={isFront ? dragRotate : 0}
                    exiting={isFront ? exiting : null}
                    crossfading={isFront && fadeKey === item.key}
                    reducedMotion={reducedMotion}
                    cardRef={isFront ? frontCardRef : undefined}
                    onFrontClick={isFront ? (e) => e.preventDefault() : undefined}
                    onFrontKeyDown={isFront ? onFrontKeyDown : undefined}
                    onFrontPointerDown={isFront ? onFrontPointerDown : undefined}
                    onFrontPointerMove={isFront ? onFrontPointerMove : undefined}
                    onFrontPointerUp={isFront ? onFrontPointerUp : undefined}
                    onFrontPointerCancel={
                      isFront ? onFrontPointerCancel : undefined
                    }
                  />
                );
              }

              const entry = item.entry;
              const edge = memberEdgeClass(entry.personId, people);
              const cardTint = cardTintForEntry(entry, people);

              return (
                <EveningDeckCard
                  key={entry.key}
                  entry={entry}
                  edge={edge}
                  cardTint={cardTint}
                  locale={locale}
                  stackIndex={stackIndex}
                  isFront={isFront}
                  frontIsWeekAhead={frontIsWeekAhead}
                  href={isFront && !frontIsWeekAhead ? frontHref : null}
                  dragX={isFront ? dragX : 0}
                  dragRotate={isFront ? dragRotate : 0}
                  exiting={isFront ? exiting : null}
                  crossfading={isFront && fadeKey === entry.key}
                  reducedMotion={reducedMotion}
                  cardRef={isFront ? frontCardRef : undefined}
                  onFrontClick={isFront ? onFrontClick : undefined}
                  onFrontKeyDown={isFront ? onFrontKeyDown : undefined}
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

      {navEntry && navHref ? (
        <EveningCardDetailOverlay
          key={navEntry.key}
          open={navOpen}
          entry={navEntry}
          locale={locale}
          originRect={detailRect}
          reducedMotion={reducedMotion}
          href={navHref}
          onDone={finishNavigate}
          returnFocusRef={frontFocusRef}
        />
      ) : null}

      {weekAhead ? (
        <>
          <WeekAheadMorphOverlay
            open={weekMorphOpen}
            model={weekAhead}
            originRect={weekMorphRect}
            reducedMotion={reducedMotion}
            onOpenSheet={() => setWeekSheetOpen(true)}
            onDone={() => {
              setWeekMorphOpen(false);
              setWeekMorphRect(null);
            }}
            returnFocusRef={frontFocusRef}
          />
          <WeekAheadSheet
            open={weekSheetOpen}
            onClose={closeWeekSheet}
            model={weekAhead}
            people={people}
            locale={locale}
          />
        </>
      ) : null}
    </>
  );
}
