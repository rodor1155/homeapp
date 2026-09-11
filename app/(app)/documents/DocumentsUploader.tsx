"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createUploadTarget, recordDocument } from "@/app/actions/documents";
import { createClient } from "@/lib/supabase-client";
import { CATEGORIES, type Category } from "@/lib/categories";
import { Button } from "@/components/ui";

const ACCEPT = "application/pdf,image/*";

export default function DocumentsUploader({
  propertyId,
  initialCategory = null,
  focus = false,
}: {
  propertyId: string;
  /** Preselected bucket — what the property hub's + passes through. */
  initialCategory?: Category | null;
  /** Arrived here to upload, so bring the panel into view. */
  focus?: boolean;
}) {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState<Category | "">(
    initialCategory ?? ""
  );
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(0);

  useEffect(() => {
    if (focus) {
      panelRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [focus]);

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
          category: category || null,
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
    <div ref={panelRef} id="upload" className="flex flex-col gap-3">
      <label className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-ink-soft">File it under</span>
        <select
          value={category}
          disabled={busy}
          onChange={(e) => setCategory(e.target.value as Category | "")}
          className="field-input w-auto"
        >
          <option value="">Let us sort it</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>

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
        className={`flex flex-col gap-3 rounded-lg border border-dashed px-4 py-5 transition-colors sm:flex-row sm:items-center sm:justify-between ${
          dragOver
            ? "border-sage-soft bg-sage-tint"
            : "border-rule-strong bg-paper"
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
