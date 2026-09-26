"use client";

import { useCallback, useState, useTransition } from "react";
import {
  createCalendarFeed,
  regenerateCalendarFeed,
  revokeCalendarFeed,
  type CalendarFeedState,
} from "@/app/actions/calendar-feed";
import CopyButton from "@/components/CopyButton";
import { Button } from "@/components/ui";
import { isCapacitorNative } from "@/lib/is-capacitor-native";
import { publicAppOrigin } from "@/lib/public-app-origin";

type Props = {
  token: string | null;
};

function feedUrls(token: string) {
  const origin = publicAppOrigin();
  const host = new URL(origin).host;
  const httpsUrl = `${origin}/api/ics/${token}.ics`;
  const webcalUrl = `webcal://${host}/api/ics/${token}.ics`;
  const googleUrl = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcalUrl)}`;
  return { httpsUrl, webcalUrl, googleUrl };
}

async function openExternal(url: string) {
  if (isCapacitorNative()) {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url });
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

export default function CalendarFeedPanel({ token }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const run = useCallback(
    (action: () => Promise<CalendarFeedState>) => {
      setError(null);
      startTransition(async () => {
        const result = await action();
        if (result?.error) setError(result.error);
        if (result?.ok) {
          setConfirmRegenerate(false);
          setConfirmRevoke(false);
        }
      });
    },
    []
  );

  const urls = token ? feedUrls(token) : null;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink-soft">
        Subscribe in Apple Calendar, Google Calendar or any app that reads iCal
        feeds. The feed includes key dates, renewals (with reminders), document
        renewal and end dates, and birthdays. School and other shared calendars
        you already link in Hearth are not repeated — subscribe to those feeds
        directly in your calendar app.
      </p>
      <p className="text-xs text-ink-faint">
        Calendar apps usually refresh every few hours.
      </p>

      {!token ? (
        <Button
          type="button"
          disabled={pending}
          onClick={() => run(createCalendarFeed)}
          className="min-h-11 w-fit"
        >
          {pending ? "Creating…" : "Create link"}
        </Button>
      ) : urls ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="text"
              readOnly
              value={urls.httpsUrl}
              aria-label="Calendar subscribe link"
              className="field-input min-h-11 flex-1 truncate font-mono text-xs"
            />
            <CopyButton value={urls.httpsUrl} label="Copy link" />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              onClick={() => openExternal(urls.webcalUrl)}
              className="btn min-h-11 w-full sm:w-auto"
            >
              Add to Apple Calendar
            </button>
            <button
              type="button"
              onClick={() => openExternal(urls.googleUrl)}
              className="btn min-h-11 w-full sm:w-auto"
            >
              Add to Google Calendar
            </button>
          </div>

          <div className="border-t border-rule pt-4">
            {confirmRegenerate ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-ink-soft">
                  The old link stops working in every calendar that uses it.
                  Regenerate?
                </p>
                <div className="flex shrink-0 items-center gap-3">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(regenerateCalendarFeed)}
                    className="btn min-h-11"
                  >
                    {pending ? "Regenerating…" : "Confirm"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmRegenerate(false)}
                    className="text-action min-h-11 text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmRegenerate(true)}
                className="text-action min-h-11 text-sm"
              >
                Regenerate link
              </button>
            )}
          </div>

          <div className="border-t border-rule pt-4">
            {confirmRevoke ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-ink-soft">
                  Turn off the subscribe link? Calendars that use it will stop
                  updating.
                </p>
                <div className="flex shrink-0 items-center gap-3">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(revokeCalendarFeed)}
                    className="text-action mark-fault min-h-11 text-sm"
                  >
                    {pending ? "Turning off…" : "Confirm"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmRevoke(false)}
                    className="text-action min-h-11 text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmRevoke(true)}
                className="text-action min-h-11 text-sm text-ink-faint"
              >
                Turn off
              </button>
            )}
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="status" className="text-sm mark-fault">
          {error}
        </p>
      ) : null}
    </div>
  );
}
