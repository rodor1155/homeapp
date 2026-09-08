"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createUploadTarget, recordDocument } from "@/app/actions/documents";
import { createClient } from "@/lib/supabase-client";

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
  const [done, setDone] = useState<number>(0);

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
      setError(e instanceof Error ? e.message : "Upload failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
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
        className={`flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-4 py-10 text-center text-sm ${
          dragOver
            ? "border-foreground bg-black/5 dark:bg-white/10"
            : "border-black/25 dark:border-white/25"
        }`}
      >
        <p className="opacity-70">
          Drag &amp; drop PDFs or photos here, or
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
            className="rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background disabled:opacity-50"
          >
            {busy ? "Uploading…" : "Choose files"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => cameraInputRef.current?.click()}
            className="rounded-md border border-black/15 px-3 py-2 text-sm font-medium hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/5 sm:hidden"
          >
            Take a photo
          </button>
        </div>
        {busy ? (
          <p className="text-xs opacity-60">Uploaded {done} file(s)…</p>
        ) : null}
        {error ? (
          <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
        ) : null}
      </div>

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
