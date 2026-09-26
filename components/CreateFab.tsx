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
        className="hearth-create-fab pointer-events-none fixed inset-x-0 z-40 flex justify-center"
        style={{
          bottom:
            "calc(var(--mobile-tab-bar-height) + max(12px, var(--safe-area-bottom)) + 0.55rem)",
        }}
      >
        <button
          type="button"
          aria-label="Add something"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className="hearth-fab-button pointer-events-auto flex h-[3.5rem] w-[3.5rem] items-center justify-center rounded-full transition-transform active:scale-95"
        >
          <Plus size={28} strokeWidth={2.3} aria-hidden />
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
