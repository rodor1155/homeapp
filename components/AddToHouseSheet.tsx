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
import { usePaywall, usePlan } from "@/components/PlanProvider";
import {
  addRenewalFromPreset,
  confirmRenewalDraft,
} from "@/lib/hearth-vault-renewals";
import { runHearthScan, hasHearthScan } from "@/lib/hearth-scan";
import type { HearthShareInDraft } from "@/lib/hearth-share-in";
import { UK_RENEWAL_PRESETS, type UkRenewalPreset } from "@/lib/uk-renewals";
import { ATLAS_COLOR_CLASS } from "@/lib/atlas-colors";
import { useRouter } from "next/navigation";

type Step = "pick" | "confirm-scan";

const BRING_IN: { id: string; label: string; icon: LucideIcon; action: "scan" | "calendar" | "share" | "siri" }[] = [
  { id: "scan", label: "Scan", icon: ScanLine, action: "scan" },
  { id: "calendar", label: "Calendar", icon: CalendarDays, action: "calendar" },
  { id: "share", label: "Share in", icon: Share2, action: "share" },
  { id: "siri", label: "Siri", icon: Mic, action: "siri" },
];

export default function AddToHouseSheet({
  open,
  onClose,
  shareDraft,
  onShareDraftConsumed,
}: {
  open: boolean;
  onClose: () => void;
  /** When the shell forwards shared files, parent passes the on-device draft. */
  shareDraft?: HearthShareInDraft | null;
  onShareDraftConsumed?: () => void;
}) {
  const router = useRouter();
  const openPaywall = usePaywall();
  const plan = usePlan();
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
    const result = await addRenewalFromPreset(preset.id);
    setBusy(false);
    if (result.needsPaywall) {
      await handlePaywall(true);
      return;
    }
    if (!result.ok) {
      setNotice(
        plan
          ? "Could not add this renewal. Try again from the Vault tab."
          : "Add renewals in the iPhone app."
      );
      return;
    }
    closeAll();
    router.refresh();
  }

  async function startScan() {
    if (!hasHearthScan()) {
      setNotice("Scanning needs the Hearth iPhone app.");
      return;
    }
    setBusy(true);
    setNotice(null);
    const scan = await runHearthScan();
    setBusy(false);
    if (!scan) {
      setNotice("Scan was cancelled or could not run.");
      return;
    }
    setConfirmSource("scan");
    setConfirmTitle(scan.suggestedTitle ?? "");
    setConfirmExpiry(scan.dates[0]?.iso ?? "");
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
      setNotice("Could not save — check the Vault in the iPhone app.");
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
          "Use Share from Mail, Files or Photos and pick Hearth — files stay on your phone."
        );
        break;
      case "siri":
        setNotice("Siri shortcuts arrive in a later app update.");
        break;
      default:
        break;
    }
  }

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

          {notice ? (
            <p role="status" className="text-sm text-ink-soft">
              {notice}
            </p>
          ) : null}
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
          {notice ? (
            <p role="status" className="text-sm text-ink-soft">
              {notice}
            </p>
          ) : null}
        </div>
      )}
    </BottomSheet>
  );
}
