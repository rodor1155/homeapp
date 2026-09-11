"use client";

import { useSyncExternalStore } from "react";

const KEY = "homeapp.viewMode";
const EVENT = "homeapp:view-mode";

export type ViewMode = "adult" | "child";

function subscribe(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(EVENT, onStoreChange);
  };
}

function getSnapshot(): ViewMode {
  return window.localStorage.getItem(KEY) === "child" ? "child" : "adult";
}

function getServerSnapshot(): ViewMode {
  return "adult";
}

export function useViewMode(): ViewMode {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function readViewMode(): ViewMode {
  if (typeof window === "undefined") return "adult";
  return getSnapshot();
}

/** Small toggle for Settings — child mode soft-hides documents-heavy chrome. */
export default function ViewModeToggle() {
  const mode = useViewMode();

  function choose(next: ViewMode) {
    window.localStorage.setItem(KEY, next);
    window.dispatchEvent(new Event(EVENT));
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-ink-soft">
        Child mode keeps the calendar, lists and timetable to hand, and tucks
        documents away. It&rsquo;s only on this device — not a lock.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          className={mode === "adult" ? "btn" : "btn-quiet"}
          onClick={() => choose("adult")}
        >
          Adult
        </button>
        <button
          type="button"
          className={mode === "child" ? "btn" : "btn-quiet"}
          onClick={() => choose("child")}
        >
          Child
        </button>
      </div>
    </div>
  );
}
