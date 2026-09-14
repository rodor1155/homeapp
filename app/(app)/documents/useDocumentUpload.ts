"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createUploadTarget, recordDocument } from "@/app/actions/documents";
import { createClient } from "@/lib/supabase-client";
import type { Category } from "@/lib/categories";

export function useDocumentUpload(propertyId: string, category: Category | "") {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(0);

  async function uploadFiles(files: File[], onSuccess?: () => void) {
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
      onSuccess?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn’t upload. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return { uploadFiles, busy, error, done, setError };
}
