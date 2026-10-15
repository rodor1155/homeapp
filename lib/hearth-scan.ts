"use client";

import { getNativePlugin } from "@/lib/native-plugin";

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

function plugin(): HearthScanPlugin | null {
  return getNativePlugin<HearthScanPlugin>("HearthScan");
}

export function hasHearthScan(): boolean {
  return typeof plugin()?.scan === "function";
}

export async function runHearthScan(): Promise<HearthScanResult | null> {
  const scan = plugin();
  if (!scan?.scan) return null;
  try {
    return await scan.scan();
  } catch {
    return null;
  }
}
