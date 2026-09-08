"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createUploadTarget, recordDocument } from "@/app/actions/documents";
import { createClient } from "@/lib/supabase-client";
import { Button } from "@/components/ui";

const ACCEPT = "application/pdf,image/*";

export default function DocumentsUploader({
  propertyId,
}: {
  propertyId: string;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(0);

  async function uploadFiles(files: File[]) {
    if (busy || files.length === 0) return;
    setBusy(true);
    setError(null);
    setDone(0);

    const supabase = createClient();
    try {
      for (const file of files) {
        const target = await createUploadTarget({
          propertyId,
          filename: file.name,
          mime: file.type || "application/octet-stream",
        });
        if ("error" in target) throw new Error(target.error);

        const { error: uploadError } = await supabase.storage
          .from("documents")
          .uploadToSignedUrl(target.path, target.token, file, {
            contentType: file.type || undefined,
          });
        if (uploadError) throw uploadError;

        const recorded = await recordDocument({
          documentId: target.documentId,
          propertyId,
          path: target.path,
          filename: file.name,
          mime: file.type || null,
        });
        if ("error" in recorded) throw new Error(recorded.error);

        setDone((n) => n + 1);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn’t upload. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void uploadFiles(Array.from(e.dataTransfer.files));
        }}
        className={`flex flex-col gap-3 rounded border border-dashed px-4 py-4 transition-colors sm:flex-row sm:items-center sm:justify-between ${
          dragOver
            ? "border-ink bg-ochre-tint"
            : "border-rule-strong bg-paper-sunk"
        }`}
      >
        <p className="text-sm text-ink-soft">
          Add a document. Drop a PDF or photo here, or:
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
          >
            {busy ? "Uploading…" : "Choose files"}
          </Button>
          <Button
            variant="quiet"
            type="button"
            disabled={busy}
            onClick={() => cameraInputRef.current?.click()}
            className="sm:hidden"
          >
            Take a photo
          </Button>
        </div>
      </div>
      {busy ? (
        <p className="text-xs text-ink-faint">Uploaded {done} so far…</p>
      ) : null}
      {error ? <p className="text-xs mark-fault">{error}</p> : null}

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          void uploadFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          void uploadFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
    </div>
  );
}
