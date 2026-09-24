"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type TouchEvent,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

const DISMISS_DRAG_PX = 80;
const DISMISS_VELOCITY = 0.45;

let openSheetCount = 0;

function syncSheetChrome() {
  if (typeof document === "undefined") return;
  const fab = document.querySelector<HTMLElement>(".hearth-create-fab");
  if (openSheetCount > 0) {
    document.body.dataset.hearthSheetOpen = "";
    fab?.setAttribute("aria-hidden", "true");
    return;
  }
  delete document.body.dataset.hearthSheetOpen;
  fab?.removeAttribute("aria-hidden");
}

function setSheetOpenAttribute(active: boolean) {
  if (typeof document === "undefined") return;
  if (active) {
    openSheetCount += 1;
  } else {
    openSheetCount = Math.max(0, openSheetCount - 1);
  }
  syncSheetChrome();
}

export default function BottomSheet({
  open,
  onClose,
  title,
  children,
  className = "",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartY = useRef(0);
  const dragStartTime = useRef(0);
  const dragOffset = useRef(0);
  const dragActive = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setSheetOpenAttribute(true);
    return () => setSheetOpenAttribute(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      setDragY(0);
      setIsDragging(false);
      dragActive.current = false;
    }
  }, [open]);

  const finishDrag = useCallback(
    (offset: number, velocity: number) => {
      dragActive.current = false;
      setIsDragging(false);
      if (offset > DISMISS_DRAG_PX || velocity > DISMISS_VELOCITY) {
        setDragY(0);
        onClose();
        return;
      }
      setDragY(0);
    },
    [onClose],
  );

  const onHeaderTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0];
    dragActive.current = true;
    setIsDragging(true);
    dragStartY.current = touch.clientY;
    dragStartTime.current = Date.now();
    dragOffset.current = 0;
    setDragY(0);
  };

  const onHeaderTouchMove = (e: TouchEvent<HTMLDivElement>) => {
    if (!dragActive.current) return;
    const touch = e.touches[0];
    const delta = Math.max(0, touch.clientY - dragStartY.current);
    dragOffset.current = delta;
    setDragY(delta);
    if (delta > 0) e.preventDefault();
  };

  const onHeaderTouchEnd = () => {
    if (!dragActive.current) return;
    const offset = dragOffset.current;
    const elapsed = Math.max(Date.now() - dragStartTime.current, 1);
    const velocity = offset / elapsed;
    finishDrag(offset, velocity);
  };

  if (!open || !mounted || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-ink/40"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{
          transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
          transition: isDragging ? "none" : "transform 200ms ease-out",
        }}
        className={`relative z-10 flex max-h-[min(92dvh,720px)] w-full max-w-lg flex-col rounded-t-2xl border border-rule bg-paper-raised shadow-none ${className}`}
      >
        <div
          className="flex shrink-0 touch-none flex-col items-center px-4 pb-2 pt-3"
          onTouchStart={onHeaderTouchStart}
          onTouchMove={onHeaderTouchMove}
          onTouchEnd={onHeaderTouchEnd}
          onTouchCancel={onHeaderTouchEnd}
        >
          <span
            aria-hidden
            className="mb-3 h-1 w-10 rounded-pill bg-rule-strong"
          />
          <div className="grid w-full grid-cols-[2.25rem_1fr_2.25rem] items-center gap-2">
            <span aria-hidden className="h-9 w-9" />
            <h2
              id={titleId}
              className="truncate text-center text-lg font-semibold text-ink"
            >
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close panel"
              className="btn-quiet h-9 w-9 shrink-0 rounded-pill p-0"
            >
              <X size={18} aria-hidden />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
