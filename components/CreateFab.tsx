"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import CreateSheet from "@/components/CreateSheet";
import { useViewMode } from "@/components/ViewModeToggle";

/** Centre + above the tab bar — opens the create chooser sheet. */
export default function CreateFab() {
  const [open, setOpen] = useState(false);
  const viewMode = useViewMode();

  return (
    <>
      <div
        className="pointer-events-none fixed inset-x-0 z-40 flex justify-center"
        style={{
          bottom:
            "calc(var(--mobile-tab-bar-height) + var(--safe-area-bottom) + 0.35rem)",
        }}
      >
        <button
          type="button"
          aria-label="Add something"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className="pointer-events-auto flex h-[3.25rem] w-[3.25rem] items-center justify-center rounded-full bg-ink text-paper-raised ring-4 ring-paper transition-transform active:scale-95"
        >
          <Plus size={26} strokeWidth={2.2} aria-hidden />
        </button>
      </div>
      <CreateSheet
        open={open}
        onClose={() => setOpen(false)}
        hideDocuments={viewMode === "child"}
      />
    </>
  );
}
