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
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronRight, Shuffle } from "lucide-react";
import { comingUpHref, type ComingUpEntry } from "@/lib/coming-up";
import {
  atlasActionsForComingUp,
  atlasEyebrowForComingUp,
} from "@/lib/atlas-deck-actions";
import { atlasColorForComingUpKind } from "@/lib/atlas-colors";
import {
  eveningCardWhen,
  eveningStackEntries,
  type PersonSortable,
} from "@/lib/evening-map";
import { openExternalUrl } from "@/lib/open-external";
import {
  bookVaultRecord,
  openVaultRecord,
  type VaultDeckCard,
} from "@/lib/hearth-vault-renewals";
import AtlasDeckCardFace from "./AtlasDeckCardFace";
import type { Locale } from "@/lib/household";
import { memberColourStyle } from "@/lib/member-colours";
import {
  weekAheadCardTint,
  type WeekAheadModel,
} from "@/lib/week-ahead";
import EveningCardDetailOverlay, { type CardDetailRect } from "./EveningCardDetailOverlay";
import EveningComingUpSheet from "./EveningComingUpSheet";
import WeekAheadMorphOverlay from "./WeekAheadMorphOverlay";
import WeekAheadSheet from "./WeekAheadSheet";

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

function AtlasDeckCardShell({
  stackIndex,
  isFront,
  frontIsWeekAhead,
  dragX,
  dragRotate,
  exiting,
  crossfading,
  reducedMotion,
  peekTitle,
  children,
  cardRef,
  onFrontKeyDown,
  onFrontPointerDown,
  onFrontPointerMove,
  onFrontPointerUp,
  onFrontPointerCancel,
}: {
  stackIndex: number;
  isFront: boolean;
  frontIsWeekAhead: boolean;
  dragX: number;
  dragRotate: number;
  exiting: "left" | "right" | null;
  crossfading?: boolean;
  reducedMotion: boolean;
  peekTitle: string;
  children: ReactNode;
  cardRef?: React.RefObject<HTMLElement | null>;
  onFrontKeyDown?: (e: ReactKeyboardEvent<HTMLElement>) => void;
  onFrontPointerDown?: (e: ReactPointerEvent<HTMLElement>) => void;
  onFrontPointerMove?: (e: ReactPointerEvent<HTMLElement>) => void;
  onFrontPointerUp?: (e: ReactPointerEvent<HTMLElement>) => void;
  onFrontPointerCancel?: (e: ReactPointerEvent<HTMLElement>) => void;
}) {
  const t = stackTransform(stackIndex, frontIsWeekAhead);
  const peekClass =
    stackIndex === 0
      ? "atlas-deck-card--front"
      : stackIndex === 1
        ? "atlas-deck-card--peek-near"
        : "atlas-deck-card--peek-far";

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

  return (
    <div
      ref={cardRef as React.RefObject<HTMLDivElement | null>}
      data-evening-deck-card={isFront ? "front" : stackIndex}
      role={isFront ? "group" : undefined}
      tabIndex={isFront ? 0 : undefined}
      className={`evening-card atlas-deck-card ${peekClass}${isFront ? " evening-card--front evening-card--interactive" : " evening-card--back"}${isFront && !reducedMotion ? " touch-none" : ""}`}
      style={{
        zIndex: t.z,
        opacity,
        transform,
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
      }}
      onKeyDown={isFront ? onFrontKeyDown : undefined}
      onPointerDown={isFront ? onFrontPointerDown : undefined}
      onPointerMove={isFront ? onFrontPointerMove : undefined}
      onPointerUp={isFront ? onFrontPointerUp : undefined}
      onPointerCancel={isFront ? onFrontPointerCancel : undefined}
    >
      {!isFront ? (
        <p className="evening-card-peek-title" aria-hidden>
          {peekTitle}
        </p>
      ) : null}
      <div className="evening-card-content" aria-hidden={!isFront}>
        {children}
      </div>
    </div>
  );
}

function EveningDeckCard({
  entry,
  locale,
  stackIndex,
  isFront,
  deckPosition,
  deckTotal,
  dragX,
  dragRotate,
  exiting,
  crossfading,
  reducedMotion,
  cardRef,
  onOpen,
  onBook,
  onFrontKeyDown,
  onFrontPointerDown,
  onFrontPointerMove,
  onFrontPointerUp,
  onFrontPointerCancel,
  frontIsWeekAhead,
}: {
  entry: ComingUpEntry;
  locale: Locale;
  stackIndex: number;
  isFront: boolean;
  deckPosition: number;
  deckTotal: number;
  frontIsWeekAhead: boolean;
  dragX: number;
  dragRotate: number;
  exiting: "left" | "right" | null;
  crossfading?: boolean;
  reducedMotion: boolean;
  cardRef?: React.RefObject<HTMLElement | null>;
  onOpen?: () => void;
  onBook?: () => void;
  onFrontKeyDown?: (e: ReactKeyboardEvent<HTMLElement>) => void;
  onFrontPointerDown?: (e: ReactPointerEvent<HTMLElement>) => void;
  onFrontPointerMove?: (e: ReactPointerEvent<HTMLElement>) => void;
  onFrontPointerUp?: (e: ReactPointerEvent<HTMLElement>) => void;
  onFrontPointerCancel?: (e: ReactPointerEvent<HTMLElement>) => void;
}) {
  const actions = atlasActionsForComingUp(entry);
  const color = atlasColorForComingUpKind(entry.kind);

  return (
    <AtlasDeckCardShell
      stackIndex={stackIndex}
      isFront={isFront}
      frontIsWeekAhead={frontIsWeekAhead}
      dragX={dragX}
      dragRotate={dragRotate}
      exiting={exiting}
      crossfading={crossfading}
      reducedMotion={reducedMotion}
      peekTitle={entry.title}
      cardRef={cardRef}
      onFrontKeyDown={onFrontKeyDown}
      onFrontPointerDown={onFrontPointerDown}
      onFrontPointerMove={onFrontPointerMove}
      onFrontPointerUp={onFrontPointerUp}
      onFrontPointerCancel={onFrontPointerCancel}
    >
      <AtlasDeckCardFace
        color={color}
        eyebrow={atlasEyebrowForComingUp(entry)}
        title={entry.title}
        whenLabel={eveningCardWhen(entry, locale)}
        position={deckPosition}
        total={deckTotal}
        bookLabel={actions.bookLabel}
        onBook={isFront && actions.bookLabel ? onBook : undefined}
        onOpen={isFront ? onOpen : undefined}
        openLabel={actions.openLabel}
        interactive={isFront}
      />
    </AtlasDeckCardShell>
  );
}

function VaultEveningDeckCard({
  card,
  stackIndex,
  isFront,
  dragX,
  dragRotate,
  exiting,
  crossfading,
  reducedMotion,
  cardRef,
  onOpen,
  onBook,
  onFrontKeyDown,
  onFrontPointerDown,
  onFrontPointerMove,
  onFrontPointerUp,
  onFrontPointerCancel,
  frontIsWeekAhead,
}: {
  card: VaultDeckCard;
  stackIndex: number;
  isFront: boolean;
  frontIsWeekAhead: boolean;
  dragX: number;
  dragRotate: number;
  exiting: "left" | "right" | null;
  crossfading?: boolean;
  reducedMotion: boolean;
  cardRef?: React.RefObject<HTMLElement | null>;
  onOpen?: () => void;
  onBook?: () => void;
  onFrontKeyDown?: (e: ReactKeyboardEvent<HTMLElement>) => void;
  onFrontPointerDown?: (e: ReactPointerEvent<HTMLElement>) => void;
  onFrontPointerMove?: (e: ReactPointerEvent<HTMLElement>) => void;
  onFrontPointerUp?: (e: ReactPointerEvent<HTMLElement>) => void;
  onFrontPointerCancel?: (e: ReactPointerEvent<HTMLElement>) => void;
}) {
  return (
    <AtlasDeckCardShell
      stackIndex={stackIndex}
      isFront={isFront}
      frontIsWeekAhead={frontIsWeekAhead}
      dragX={dragX}
      dragRotate={dragRotate}
      exiting={exiting}
      crossfading={crossfading}
      reducedMotion={reducedMotion}
      peekTitle={card.title}
      cardRef={cardRef}
      onFrontKeyDown={onFrontKeyDown}
      onFrontPointerDown={onFrontPointerDown}
      onFrontPointerMove={onFrontPointerMove}
      onFrontPointerUp={onFrontPointerUp}
      onFrontPointerCancel={onFrontPointerCancel}
    >
      <AtlasDeckCardFace
        color={card.color}
        eyebrow={card.eyebrow}
        title={card.title}
        badge={card.badge}
        whenLabel={card.whenLabel}
        position={card.position}
        total={card.total}
        bookLabel={card.bookLabel}
        onBook={isFront && card.bookLabel ? onBook : undefined}
        onOpen={isFront ? onOpen : undefined}
        interactive={isFront}
      />
    </AtlasDeckCardShell>
  );
}

type DeckItem =
  | { kind: "week-ahead"; key: string; model: WeekAheadModel }
  | { kind: "vault"; key: string; card: VaultDeckCard }
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
  vaultCards = [],
  people,
  locale,
  weekAhead = null,
  initialWeekSheetOpen = false,
  onWeekSheetClose,
}: {
  entries: readonly ComingUpEntry[];
  /** Entries for the swipeable fan; defaults to `entries`. */
  deckEntries?: readonly ComingUpEntry[];
  vaultCards?: readonly VaultDeckCard[];
  people: readonly PersonSortable[];
  locale: Locale;
  weekAhead?: WeekAheadModel | null;
  initialWeekSheetOpen?: boolean;
  onWeekSheetClose?: () => void;
}) {
  const fanSource = deckEntries ?? entries;
  const regularStack = eveningStackEntries(fanSource, 6);
  const vaultItems: DeckItem[] = vaultCards.map((card) => ({
    kind: "vault" as const,
    key: `vault:${card.id}`,
    card,
  }));
  const entryItems: DeckItem[] = regularStack.map((entry) => ({
    kind: "entry" as const,
    key: entry.key,
    entry,
  }));
  const stack: DeckItem[] = weekAhead
    ? [
        { kind: "week-ahead", key: "week-ahead", model: weekAhead },
        ...vaultItems,
        ...entryItems,
      ]
    : [...vaultItems, ...entryItems];
  const deckTotal = stack.length;
  const stackFingerprint = stack
    .map((item) => {
      if (item.kind === "week-ahead") {
        return `week-ahead:${item.model.range.monday}`;
      }
      if (item.kind === "vault") {
        return `vault:${item.card.id}:${item.card.whenLabel}`;
      }
      return `${item.entry.key}:${item.entry.date}`;
    })
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
  const frontVault =
    frontItem?.kind === "vault" ? frontItem.card : undefined;
  const frontHref = frontEntry ? comingUpHref(frontEntry) : null;
  const frontIsWeekAhead = frontItem?.kind === "week-ahead";

  useEffect(() => {
    for (const item of visible) {
      if (item.kind !== "entry") continue;
      const href = comingUpHref(item.entry);
      if (href) router.prefetch(href);
    }
  }, [router, visible]);

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

  const openFrontRecord = () => {
    if (frontVault) {
      void openVaultRecord(frontVault.id);
      return;
    }
    if (frontEntry && frontHref) startNavigate(frontEntry, frontHref);
  };

  const bookFrontRecord = () => {
    if (frontVault?.bookUrl) {
      void openExternalUrl(frontVault.bookUrl);
      return;
    }
    if (frontVault) {
      void bookVaultRecord(frontVault.id);
      return;
    }
    if (frontEntry) {
      const { bookUrl } = atlasActionsForComingUp(frontEntry);
      if (bookUrl) void openExternalUrl(bookUrl);
    }
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
      } else if (frontVault || (frontEntry && frontHref)) {
        openFrontRecord();
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

  const onFrontKeyDown = (
    e: ReactKeyboardEvent<HTMLAnchorElement | HTMLButtonElement | HTMLElement>
  ) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (frontIsWeekAhead) {
      startWeekAhead();
      return;
    }
    if (frontVault || (frontEntry && frontHref)) openFrontRecord();
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
              See all ({entries.length + vaultCards.length})
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

              if (item.kind === "vault") {
                const card = item.card;
                return (
                  <VaultEveningDeckCard
                    key={item.key}
                    card={card}
                    stackIndex={stackIndex}
                    isFront={isFront}
                    frontIsWeekAhead={frontIsWeekAhead}
                    dragX={isFront ? dragX : 0}
                    dragRotate={isFront ? dragRotate : 0}
                    exiting={isFront ? exiting : null}
                    crossfading={isFront && fadeKey === item.key}
                    reducedMotion={reducedMotion}
                    cardRef={isFront ? frontCardRef : undefined}
                    onOpen={isFront ? openFrontRecord : undefined}
                    onBook={isFront ? bookFrontRecord : undefined}
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
              const deckPosition =
                rotatedStack.findIndex((v) => v.key === item.key) + 1;

              return (
                <EveningDeckCard
                  key={entry.key}
                  entry={entry}
                  locale={locale}
                  stackIndex={stackIndex}
                  isFront={isFront}
                  deckPosition={deckPosition}
                  deckTotal={deckTotal}
                  frontIsWeekAhead={frontIsWeekAhead}
                  dragX={isFront ? dragX : 0}
                  dragRotate={isFront ? dragRotate : 0}
                  exiting={isFront ? exiting : null}
                  crossfading={isFront && fadeKey === entry.key}
                  reducedMotion={reducedMotion}
                  cardRef={isFront ? frontCardRef : undefined}
                  onOpen={isFront ? openFrontRecord : undefined}
                  onBook={isFront ? bookFrontRecord : undefined}
                  onFrontKeyDown={isFront ? onFrontKeyDown : undefined}
                  onFrontPointerDown={ isFront ? onFrontPointerDown : undefined}
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
