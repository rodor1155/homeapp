"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CalendarDays,
  Mic,
  ScanLine,
  Share2,
  type LucideIcon,
} from "lucide-react";
import BottomSheet from "@/components/BottomSheet";
import { usePaywall } from "@/components/PlanProvider";
import {
  addRenewalFromPreset,
  confirmRenewalDraft,
  hasVaultRenewalPresets,
} from "@/lib/hearth-vault-renewals";
import {
  runHearthScan,
  hearthScanAvailabilityMessage,
  hasHearthScan,
} from "@/lib/hearth-scan";
import { hasHearthShareIn } from "@/lib/hearth-share-in";
import type { HearthShareInDraft } from "@/lib/hearth-share-in";
import { UK_RENEWAL_PRESETS, type UkRenewalPreset } from "@/lib/uk-renewals";
import { ATLAS_COLOR_CLASS } from "@/lib/atlas-colors";
import { useRouter } from "next/navigation";
import { isCapacitorNative } from "@/lib/is-capacitor-native";

type Step = "pick" | "confirm-scan";

const BRING_IN: {
  id: string;
  label: string;
  icon: LucideIcon;
  action: "scan" | "calendar" | "share" | "siri";
}[] = [
  { id: "scan", label: "Scan", icon: ScanLine, action: "scan" },
  { id: "calendar", label: "Calendar", icon: CalendarDays, action: "calendar" },
  { id: "share", label: "Share in", icon: Share2, action: "share" },
  { id: "siri", label: "Siri", icon: Mic, action: "siri" },
];

function Notice({ children }: { children: string }) {
  return (
    <p role="alert" className="atlas-sheet-notice text-sm">
      {children}
    </p>
  );
}

export default function AddToHouseSheet({
  open,
  onClose,
  shareDraft,
  onShareDraftConsumed,
}: {
  open: boolean;
  onClose: () => void;
  shareDraft?: HearthShareInDraft | null;
  onShareDraftConsumed?: () => void;
}) {
  const router = useRouter();
  const openPaywall = usePaywall();
  const [step, setStep] = useState<Step>("pick");
  const [busy, setBusy] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState("");
  const [confirmExpiry, setConfirmExpiry] = useState("");
  const [confirmSource, setConfirmSource] = useState<"scan" | "share" | null>(
    null
  );
  const [confirmShareDraft, setConfirmShareDraft] =
    useState<HearthShareInDraft | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const resetConfirm = useCallback(() => {
    setStep("pick");
    setConfirmTitle("");
    setConfirmExpiry("");
    setConfirmSource(null);
    setConfirmShareDraft(null);
    setNotice(null);
  }, []);

  const closeAll = useCallback(() => {
    resetConfirm();
    onClose();
  }, [onClose, resetConfirm]);

  const handlePaywall = useCallback(
    async (needsPaywall: boolean | undefined) => {
      if (needsPaywall) {
        await openPaywall("renewals");
      }
    },
    [openPaywall]
  );

  async function pickPreset(preset: UkRenewalPreset) {
    setBusy(true);
    setNotice(null);
    if (!hasVaultRenewalPresets()) {
      setBusy(false);
      setNotice(
        isCapacitorNative()
          ? "This TestFlight build is missing addRenewalFromPreset on HearthVault. Update the app, or add the renewal from Vault."
          : "Preset renewals are saved on your iPhone. Open the Hearth app to add this."
      );
      return;
    }
    const result = await addRenewalFromPreset(preset.id);
    setBusy(false);
    if (result.needsPaywall) {
      await handlePaywall(true);
      return;
    }
    if (!result.ok) {
      setNotice(result.message ?? "Could not add this renewal.");
      return;
    }
    closeAll();
    router.refresh();
  }

  async function startScan() {
    const unavailable = hearthScanAvailabilityMessage();
    if (unavailable) {
      setNotice(unavailable);
      return;
    }
    if (!hasHearthScan()) {
      setNotice(
        "Scan is not registered in this app build (HearthScan plugin missing). Update the Hearth iPhone app."
      );
      return;
    }
    setBusy(true);
    setNotice(null);
    const scan = await runHearthScan();
    setBusy(false);
    if (!scan.ok) {
      setNotice(scan.message);
      return;
    }
    setConfirmSource("scan");
    setConfirmTitle(scan.result.suggestedTitle ?? "");
    setConfirmExpiry(scan.result.dates[0]?.iso ?? "");
    setStep("confirm-scan");
  }

  useEffect(() => {
    if (!open || !shareDraft || step !== "pick") return;
    setConfirmSource("share");
    setConfirmShareDraft(shareDraft);
    setConfirmTitle(shareDraft.suggestedTitle ?? shareDraft.sourceNames?.[0] ?? "");
    setConfirmExpiry(shareDraft.dates?.[0]?.iso ?? "");
    setStep("confirm-scan");
    onShareDraftConsumed?.();
  }, [open, shareDraft, step, onShareDraftConsumed]);

  async function saveDraft() {
    setBusy(true);
    setNotice(null);
    const result = await confirmRenewalDraft({
      title: confirmTitle.trim() || undefined,
      expiryIso: confirmExpiry.trim() || undefined,
      shareIn:
        confirmSource === "share" ? confirmShareDraft ?? undefined : undefined,
      scan:
        confirmSource === "scan"
          ? {
              text: "",
              dates: confirmExpiry
                ? [{ iso: confirmExpiry, label: confirmTitle }]
                : [],
              suggestedTitle: confirmTitle,
            }
          : undefined,
    });
    setBusy(false);
    if (result.needsPaywall) {
      await handlePaywall(true);
      return;
    }
    if (!result.ok) {
      setNotice(result.message ?? "Could not save on your phone.");
      return;
    }
    closeAll();
    router.refresh();
  }

  function bringIn(action: (typeof BRING_IN)[number]["action"]) {
    switch (action) {
      case "scan":
        void startScan();
        break;
      case "calendar":
        closeAll();
        router.push("/calendar?add=1");
        break;
      case "share":
        setNotice(
          hasHearthShareIn()
            ? "From Mail, Files or Photos: tap Share → Hearth. The file stays on your phone; we open a confirm screen when the app receives it."
            : "Share-in needs a newer Hearth iPhone build (HearthShareIn plugin). Update the app, then use Share → Hearth from another app."
        );
        break;
      case "siri":
        setNotice("Siri shortcuts arrive in a later app update.");
        break;
      default:
        break;
    }
  }

  const shareHint =
    isCapacitorNative() && hasHearthShareIn()
      ? "Tip: share a PDF or photo from another app — choose Hearth in the Share sheet."
      : isCapacitorNative()
        ? "Share-in requires the latest Hearth iPhone build."
        : null;

  return (
    <BottomSheet
      open={open}
      onClose={closeAll}
      title={step === "pick" ? "Add to the house" : "Confirm renewal"}
      className="max-h-[min(85dvh,640px)]"
    >
      {step === "pick" ? (
        <div className="flex flex-col gap-5 pb-2">
          <p className="text-sm text-ink-soft">
            Pick one — we pre-fill the dates and reminders on your phone. Nothing
            is uploaded to Hearth&apos;s servers.
          </p>

          {shareHint ? (
            <p className="text-xs font-medium text-ink-muted">{shareHint}</p>
          ) : null}

          <ul className="grid grid-cols-2 gap-2.5">
            {UK_RENEWAL_PRESETS.map((preset) => (
              <li key={preset.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void pickPreset(preset)}
                  className={`atlas-renewal-tile ${ATLAS_COLOR_CLASS[preset.color]}`}
                >
                  <span className="atlas-renewal-tile-title">{preset.title}</span>
                  <span className="atlas-renewal-tile-sub">{preset.subtitle}</span>
                </button>
              </li>
            ))}
          </ul>

          <div>
            <p className="atlas-section-label">Or bring it in</p>
            <ul className="mt-2 grid grid-cols-4 gap-2">
              {BRING_IN.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="atlas-bring-in-btn"
                      disabled={busy && item.action === "scan"}
                      onClick={() => bringIn(item.action)}
                    >
                      <Icon size={22} strokeWidth={1.9} aria-hidden />
                      <span>{item.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {notice ? <Notice>{notice}</Notice> : null}
        </div>
      ) : (
        <div className="flex flex-col gap-4 pb-2">
          <p className="text-sm text-ink-soft">
            Check the title and expiry — reminders stay on this iPhone only.
          </p>
          <label className="block">
            <span className="field-label">Title</span>
            <input
              className="field-input mt-1 w-full"
              value={confirmTitle}
              onChange={(e) => setConfirmTitle(e.target.value)}
              autoComplete="off"
            />
          </label>
          <label className="block">
            <span className="field-label">Expiry date</span>
            <input
              type="date"
              className="field-input mt-1 w-full tnum"
              value={confirmExpiry}
              onChange={(e) => setConfirmExpiry(e.target.value)}
            />
          </label>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              className="btn btn-secondary flex-1"
              disabled={busy}
              onClick={resetConfirm}
            >
              Back
            </button>
            <button
              type="button"
              className="btn btn-primary flex-1"
              disabled={busy}
              onClick={() => void saveDraft()}
            >
              Save on this phone
            </button>
          </div>
          {notice ? <Notice>{notice}</Notice> : null}
        </div>
      )}
    </BottomSheet>
  );
}
