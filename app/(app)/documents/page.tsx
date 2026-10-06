import { FileText } from "lucide-react";
import DocumentsVaultHandoff from "./DocumentsVaultHandoff";
import { Card } from "@/components/ui";
import { appTitle } from "@/lib/brand";
import { requireOnboarded } from "@/lib/household";

export const metadata = { title: appTitle("Vault") };

export default async function DocumentsPage() {
  await requireOnboarded();

  return (
    <DocumentsVaultHandoff>
      <div className="flex flex-col gap-4">
        <div className="px-1">
          <h1 className="text-2xl">Vault</h1>
        </div>

        <Card className="text-center">
          <span
            aria-hidden
            className="mx-auto flex h-12 w-12 items-center justify-center rounded-pill bg-sage-tint text-sage"
          >
            <FileText size={22} strokeWidth={1.8} />
          </span>
          <h2 className="mt-3 text-base font-semibold text-ink">
            Documents now live on your iPhone
          </h2>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-ink-soft">
            Documents now live on your iPhone in the Hearth app, encrypted
            on your device and synced through your own iCloud.
          </p>
        </Card>
      </div>
    </DocumentsVaultHandoff>
  );
}
