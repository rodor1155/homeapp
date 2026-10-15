"use client";

import { useEffect } from "react";
import {
  consumeShareInDraft,
  onShareInReceived,
  type HearthShareInDraft,
} from "@/lib/hearth-share-in";

/** Notifies the app when the iOS shell forwards Share-in files (on-device only). */
export default function HearthShareInListener({
  onDraft,
}: {
  onDraft: (draft: HearthShareInDraft) => void;
}) {
  useEffect(() => {
    let cancelled = false;

    void consumeShareInDraft().then((draft) => {
      if (!cancelled && draft) onDraft(draft);
    });

    let removeListener: (() => void) | undefined;
    void onShareInReceived(() => {
      void consumeShareInDraft().then((draft) => {
        if (draft) onDraft(draft);
      });
    }).then((remove) => {
      removeListener = remove;
    });

    return () => {
      cancelled = true;
      removeListener?.();
    };
  }, [onDraft]);

  return null;
}
