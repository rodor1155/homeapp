"use client";

import { useEffect, type ReactNode } from "react";
import { FileText } from "lucide-react";
import { Button, Card } from "@/components/ui";
import {
  openNativeAdd,
  openNativeVault,
  useHasNativeVault,
} from "@/lib/native-vault";

export default function DocumentsVaultHandoff({
  children,
  startUpload = false,
}: {
  children: ReactNode;
  startUpload?: boolean;
}) {
  const nativeVault = useHasNativeVault();

  useEffect(() => {
    if (!nativeVault || !startUpload) return;
    void openNativeAdd();
  }, [nativeVault, startUpload]);

  if (!nativeVault) {
    return <>{children}</>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="px-1">
        <h1 className="text-2xl">Documents</h1>
        <p className="mt-0.5 text-sm text-ink-soft">
          Stored securely on this iPhone
        </p>
      </div>

      <Card className="text-center">
        <span
          aria-hidden
          className="mx-auto flex h-12 w-12 items-center justify-center rounded-pill bg-sage-tint text-sage"
        >
          <FileText size={22} strokeWidth={1.8} />
        </span>
        <h2 className="mt-3 text-base font-semibold text-ink">
          Your documents live on this iPhone
        </h2>
        <p className="mx-auto mt-1.5 max-w-xs text-sm text-ink-soft">
          Open the on-device vault to browse paperwork you have scanned here.
          Documents sync with iCloud on this device.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <Button type="button" onClick={() => void openNativeVault()}>
            Open documents
          </Button>
          <Button
            type="button"
            variant="quiet"
            onClick={() => void openNativeAdd()}
          >
            Add a document
          </Button>
        </div>
      </Card>
    </div>
  );
}
