"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
  type RefObject,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { markRenewalDone } from "@/app/actions/renewals";
import CalendarEventDetailBody from "@/components/CalendarEventDetailBody";
import CopyButton from "@/components/CopyButton";
import { Button } from "@/components/ui";
import { detailFromComingUp, isTappableComingUp } from "@/lib/calendar-event-detail";
import { COMING_UP_TONE, type ComingUpEntry } from "@/lib/coming-up";
import { formatDate, relativeWhen } from "@/lib/dates";
import { eveningCardWhen } from "@/lib/evening-map";
import type { Locale } from "@/lib/household";
import { TONE_PILL } from "@/lib/tones";

const SPRING = "cubic-bezier(0.2, 0.9, 0.25, 1.15)";
const EXPAND_MS = 380;
const COLLAPSE_MS = 320;
const DETAIL_MAX_W = 28 * 16; // 28rem
const DETAIL_MAX_H_RATIO = 0.75;

export type CardDetailRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

type PendingNav = { href: string } | null;

export default function EveningCardDetailOverlay({
  open,
  entry,
  locale,
  originRect,
  reducedMotion,
  onClose,
  returnFocusRef,
}: {
  open: boolean;
  entry: ComingUpEntry | null;
  locale: Locale;
  originRect: CardDetailRect | null;
  reducedMotion: boolean;
  onClose: () => void;
  returnFocusRef: RefObject<HTMLElement | null>;
}) {
  const router = useRouter();
  const backdropRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dragStartY = useRef<number | null>(null);
  const [markState, setMarkState] = useState<{ ok?: boolean; error?: string; nextDue?: string }>();
  const [markPending, startMark] = useTransition();
  const [pendingNav, setPendingNav] = useState<PendingNav>(null);
  const closingRef = useRef(false);

  const panelStyle = open && entry ? targetRect() : null;

  const runFlip = useCallback(
    (
      expand: boolean,
      rect: CardDetailRect,
      target: CardDetailRect,
      onDone?: () => void
    ) => {
      const panel = panelRef.current;
      if (!panel || reducedMotion) {
        onDone?.();
        return;
      }

      requestAnimationFrame(() => {
        const from = expand ? rect : target;
        const to = expand ? target : rect;

        const sx = from.width / to.width;
        const sy = from.height / to.height;
        const tx = from.left + from.width / 2 - (to.left + to.width / 2);
        const ty = from.top + from.height / 2 - (to.top + to.height / 2);

        const animation = panel.animate(
          [
            {
              transform: `translate(${tx}px, ${ty}px) scale(${sx}, ${sy})`,
              opacity: expand ? 0.92 : 1,
            },
            { transform: "translate(0, 0) scale(1, 1)", opacity: 1 },
          ],
          {
            duration: expand ? EXPAND_MS : COLLAPSE_MS,
            easing: SPRING,
            fill: "forwards",
          }
        );

        animation.onfinish = () => {
          animation.cancel();
          panel.style.transform = "";
          onDone?.();
        };
      });
    },
    [reducedMotion]
  );

  const finishClose = useCallback(() => {
    closingRef.current = false;
    onClose();
    returnFocusRef.current?.focus();
    if (pendingNav) {
      router.push(pendingNav.href);
      setPendingNav(null);
    }
  }, [onClose, pendingNav, returnFocusRef, router]);

  const requestClose = useCallback(
    (nav?: PendingNav) => {
      if (closingRef.current) return;
      closingRef.current = true;
      if (nav) setPendingNav(nav);

      if (reducedMotion || !originRect) {
        finishClose();
        return;
      }

      backdropRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: COLLAPSE_MS,
        easing: "ease-out",
        fill: "forwards",
      });

      runFlip(false, originRect, targetRect(), finishClose);
    },
    [finishClose, originRect, reducedMotion, runFlip]
  );

  useLayoutEffect(() => {
    if (!open || !entry) return;

    closingRef.current = false;
    closeRef.current?.focus();

    if (reducedMotion || !originRect) return;

    backdropRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: EXPAND_MS * 0.85,
      easing: "ease-out",
      fill: "forwards",
    });
    runFlip(true, originRect, targetRect());
  }, [open, entry, originRect, reducedMotion, runFlip]);

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        requestClose();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;

      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, requestClose]);

  const onBackdropClick = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current) requestClose();
  };

  const onDragDownStart = (e: ReactPointerEvent) => {
    if (reducedMotion) return;
    dragStartY.current = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onDragDownMove = (e: ReactPointerEvent) => {
    if (dragStartY.current === null) return;
    const dy = e.clientY - dragStartY.current;
    if (dy > 80) {
      dragStartY.current = null;
      requestClose();
    }
  };

  const onDragDownEnd = () => {
    dragStartY.current = null;
  };

  const markDone = () => {
    if (!entry?.renewalId) return;
    startMark(async () => {
      const result = await markRenewalDone(entry.renewalId!);
      if (result?.ok) {
        setMarkState({ ok: true, nextDue: result.nextDue });
        setTimeout(() => requestClose(), 600);
      } else {
        setMarkState({ error: result?.error ?? "Something went wrong." });
      }
    });
  };

  if (!open || !entry || !panelStyle) return null;

  const calendarDetail = isTappableComingUp(entry)
    ? detailFromComingUp(entry)
    : null;
  const tone = TONE_PILL[COMING_UP_TONE[entry.kind]];

  return (
    <div
      className="evening-detail-root"
      role="presentation"
      aria-hidden={false}
    >
      <div
        ref={backdropRef}
        className="evening-detail-backdrop"
        onClick={onBackdropClick}
        aria-hidden
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="evening-detail-title"
        className="evening-detail-dialog"
      >
        <div
          ref={panelRef}
          className={`evening-detail-panel evening-glass-card ${reducedMotion ? "evening-detail-panel--fade" : ""}`}
          style={{
            top: panelStyle.top,
            left: panelStyle.left,
            width: panelStyle.width,
            maxHeight: panelStyle.height,
          }}
        >
          <div
            className="evening-detail-grab touch-none"
            onPointerDown={onDragDownStart}
            onPointerMove={onDragDownMove}
            onPointerUp={onDragDownEnd}
            onPointerCancel={onDragDownEnd}
          >
            <span aria-hidden className="evening-detail-grab-bar" />
          </div>

          <div className="evening-detail-header">
            <h2 id="evening-detail-title" className="evening-detail-title">
              {entry.title}
            </h2>
            <button
              ref={closeRef}
              type="button"
              className="evening-detail-close"
              aria-label="Close"
              onClick={() => requestClose()}
            >
              <X size={20} strokeWidth={2} aria-hidden />
            </button>
          </div>

          <div className="evening-detail-body">
            {calendarDetail ? (
              <CalendarEventDetailBody detail={calendarDetail} locale={locale} />
            ) : entry.kind === "renewal" && entry.renewalId ? (
              <RenewalDetailBody
                entry={entry}
                locale={locale}
                markState={markState}
                markPending={markPending}
                onMarkDone={markDone}
                onEdit={() =>
                  requestClose({
                    href: `/family?renewal=${entry.renewalId}#renewals`,
                  })
                }
              />
            ) : (
              <SimpleDetailBody
                entry={entry}
                locale={locale}
                tone={tone}
                onNavigate={(href) => requestClose({ href })}
              />
            )}
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

function RenewalDetailBody({
  entry,
  locale,
  markState,
  markPending,
  onMarkDone,
  onEdit,
}: {
  entry: ComingUpEntry;
  locale: Locale;
  markState?: { ok?: boolean; error?: string; nextDue?: string };
  markPending: boolean;
  onMarkDone: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 pb-2">
      <dl className="flex flex-col gap-3 text-sm">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-ink-faint">
            Due
          </dt>
          <dd className="tnum mt-0.5 text-ink">
            {formatDate(entry.date, locale)}
            {entry.overdue ? " · Overdue" : ` · ${relativeWhen(entry.daysAway)}`}
          </dd>
        </div>
        {entry.note ? (
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-ink-faint">
              Status
            </dt>
            <dd className="mt-0.5 text-ink">{entry.note}</dd>
          </div>
        ) : null}
      </dl>

      {entry.renewalReference ? (
        <div className="border-t border-rule pt-2">
          <CopyButton value={entry.renewalReference} label="Copy ref" />
        </div>
      ) : null}

      <div className="flex flex-col gap-2 border-t border-rule pt-3">
        {markState?.nextDue ? (
          <p className="text-sm mark-filed">
            Next due {formatDate(markState.nextDue, locale)}
          </p>
        ) : markState?.error ? (
          <p className="text-sm mark-fault">{markState.error}</p>
        ) : (
          <Button
            type="button"
            variant="quiet"
            disabled={markPending}
            className="min-h-11 w-full"
            onClick={onMarkDone}
          >
            {markPending ? "Updating…" : "Mark done"}
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          className="min-h-11 w-full"
          onClick={onEdit}
        >
          Edit
        </Button>
      </div>
    </div>
  );
}

function SimpleDetailBody({
  entry,
  locale,
  tone,
  onNavigate,
}: {
  entry: ComingUpEntry;
  locale: Locale;
  tone: string;
  onNavigate: (href: string) => void;
}) {
  const when = eveningCardWhen(entry, locale);
  const href =
    entry.kind === "document"
      ? "/documents"
      : entry.kind === "birthday" || entry.kind === "event"
        ? "/family"
        : entry.kind === "timetable" || entry.kind === "routine"
          ? "/calendar"
          : null;

  return (
    <div className="flex flex-col gap-4 pb-2">
      <dl className="flex flex-col gap-3 text-sm">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-ink-faint">
            When
          </dt>
          <dd className="tnum mt-0.5 text-ink">{when}</dd>
        </div>
        {entry.note ? (
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-ink-faint">
              Details
            </dt>
            <dd className="mt-0.5 text-ink">{entry.note}</dd>
          </div>
        ) : null}
      </dl>

      {href ? (
        <Button
          type="button"
          variant="ghost"
          className={`min-h-11 w-full ${tone}`}
          onClick={() => onNavigate(href)}
        >
          {entry.kind === "document"
            ? "Open documents"
            : entry.kind === "birthday" || entry.kind === "event"
              ? "Open family"
              : "Open calendar"}
        </Button>
      ) : null}
    </div>
  );
}
