"use client";

import { useCallback, useState } from "react";
import { Plus } from "lucide-react";
import AddToHouseSheet from "@/components/AddToHouseSheet";
import HearthShareInListener from "@/components/HearthShareInListener";
import type { HearthShareInDraft } from "@/lib/hearth-share-in";
import { useViewMode } from "@/components/ViewModeToggle";

/** Centre + above the tab bar — opens the Atlas add sheet. */
export default function CreateFab() {
  const [open, setOpen] = useState(false);
  const [shareDraft, setShareDraft] = useState<HearthShareInDraft | null>(null);
  const viewMode = useViewMode();
  const onShareDraft = useCallback((draft: HearthShareInDraft) => {
    setShareDraft(draft);
    setOpen(true);
  }, []);

  return (
    <>
      <HearthShareInListener onDraft={onShareDraft} />
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
      <AddToHouseSheet
        open={open && viewMode !== "child"}
        onClose={() => setOpen(false)}
        shareDraft={shareDraft}
        onShareDraftConsumed={() => setShareDraft(null)}
      />
    </>
  );
}
