"use client";

import { getNativePlugin } from "@/lib/native-plugin";
import { isCapacitorNative } from "@/lib/is-capacitor-native";

/** A date the on-device OCR spotted — never sent to Rodor servers. */
export type HearthScanDate = {
  /** ISO calendar date YYYY-MM-DD */
  iso: string;
  label?: string;
};

/** Result of a native document scan — processed on the phone only. */
export type HearthScanResult = {
  /** Full recognised text from the scan pipeline. */
  text: string;
  dates: HearthScanDate[];
  /** Optional title the native layer inferred (policy name, etc.). */
  suggestedTitle?: string;
};

export type HearthScanPlugin = {
  scan: () => Promise<HearthScanResult>;
};

export type HearthScanRunResult =
  | { ok: true; result: HearthScanResult }
  | {
      ok: false;
      reason: "missing_plugin" | "cancelled" | "plugin_error";
      message: string;
    };

function plugin(): HearthScanPlugin | null {
  return getNativePlugin<HearthScanPlugin>("HearthScan");
}

export function hasHearthScan(): boolean {
  return typeof plugin()?.scan === "function";
}

export function hearthScanAvailabilityMessage(): string | null {
  if (!isCapacitorNative()) {
    return "Document scanning only works inside the Hearth iPhone app.";
  }
  if (!hasHearthScan()) {
    return "This build does not include the Scan plugin yet. Update the Hearth app from TestFlight.";
  }
  return null;
}

export async function runHearthScan(): Promise<HearthScanRunResult> {
  const unavailable = hearthScanAvailabilityMessage();
  if (unavailable) {
    return { ok: false, reason: "missing_plugin", message: unavailable };
  }
  const scan = plugin();
  if (!scan?.scan) {
    return {
      ok: false,
      reason: "missing_plugin",
      message:
        "Scan is not available in this app build. Update the Hearth iPhone app.",
    };
  }
  try {
    const result = await scan.scan();
    if (!result) {
      return {
        ok: false,
        reason: "cancelled",
        message: "Scan was cancelled.",
      };
    }
    return { ok: true, result };
  } catch (error) {
    const message =
      (error as { message?: string })?.message ??
      "The scan could not finish. Try again.";
    return { ok: false, reason: "plugin_error", message };
  }
}
