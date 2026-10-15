"use client";

import { getNativePlugin } from "@/lib/native-plugin";

/** Payload the iOS shell forwards after Share-in — bytes stay on device. */
export type HearthShareInFile = {
  name: string;
  mimeType: string;
  /** Base64 file bytes; native only — web layer must not POST this anywhere. */
  base64?: string;
};

export type HearthShareInPayload = {
  files: HearthShareInFile[];
};

/** On-device extraction summary after the shell ingests shared files. */
export type HearthShareInDraft = {
  text?: string;
  dates?: { iso: string; label?: string }[];
  suggestedTitle?: string;
  sourceNames?: string[];
};

type ListenerHandle = { remove: () => void | Promise<void> };

export type HearthShareInPlugin = {
  /** Returns a draft if the shell is holding files from a cold-start share. */
  consumePendingDraft?: () => Promise<HearthShareInDraft | null>;
  addListener?: (
    event: "shareReceived",
    listener: (payload: HearthShareInPayload) => void
  ) => Promise<ListenerHandle> | ListenerHandle;
};

function plugin(): HearthShareInPlugin | null {
  return getNativePlugin<HearthShareInPlugin>("HearthShareIn");
}

export function hasHearthShareIn(): boolean {
  const p = plugin();
  return (
    typeof p?.addListener === "function" ||
    typeof p?.consumePendingDraft === "function"
  );
}

export async function consumeShareInDraft(): Promise<HearthShareInDraft | null> {
  const p = plugin();
  if (!p?.consumePendingDraft) return null;
  try {
    return await p.consumePendingDraft();
  } catch {
    return null;
  }
}

export async function onShareInReceived(
  listener: (payload: HearthShareInPayload) => void
): Promise<() => void> {
  const p = plugin();
  if (!p?.addListener) return () => {};
  try {
    const handle = await p.addListener("shareReceived", listener);
    return () => {
      void handle.remove();
    };
  } catch {
    return () => {};
  }
}
