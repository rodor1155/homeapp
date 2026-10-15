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
  /**
   * Opens the system Files picker; native code runs the same on-device ingest
   * as the Share extension. Resolves with a draft, or null when cancelled.
   */
  pickFiles?: () => Promise<HearthShareInDraft | null>;
  addListener?: (
    event: "shareReceived",
    listener: (payload: HearthShareInPayload) => void
  ) => Promise<ListenerHandle> | ListenerHandle;
};

export type PickShareInResult =
  | { ok: true; draft: HearthShareInDraft }
  | {
      ok: false;
      reason: "missing_plugin" | "cancelled" | "error";
      message: string;
    };

function plugin(): HearthShareInPlugin | null {
  return getNativePlugin<HearthShareInPlugin>("HearthShareIn");
}

export function hasHearthShareIn(): boolean {
  const p = plugin();
  return (
    typeof p?.pickFiles === "function" ||
    typeof p?.addListener === "function" ||
    typeof p?.consumePendingDraft === "function"
  );
}

export function hasShareInPickFiles(): boolean {
  return typeof plugin()?.pickFiles === "function";
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

export async function pickShareInFiles(): Promise<PickShareInResult> {
  const p = plugin();
  if (!p?.pickFiles) {
    return {
      ok: false,
      reason: "missing_plugin",
      message:
        "File picking needs a newer Hearth iPhone build (HearthShareIn.pickFiles). Update the app, or use Share → Hearth from Mail or Photos.",
    };
  }
  try {
    let draft = await p.pickFiles();
    if (!draft && p.consumePendingDraft) {
      draft = await p.consumePendingDraft();
    }
    if (!draft) {
      return {
        ok: false,
        reason: "cancelled",
        message: "No file was selected.",
      };
    }
    return { ok: true, draft };
  } catch (error) {
    const message =
      (error as { message?: string })?.message ??
      "Could not read that file on your phone.";
    return { ok: false, reason: "error", message };
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
