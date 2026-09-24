"use client";

import BottomSheet from "@/components/BottomSheet";
import type { CalendarEventDetail } from "@/lib/calendar-event-detail";
import { formatEventWhen } from "@/lib/dates";
import type { Locale } from "@/lib/household";

export default function CalendarEventDetailSheet({
  open,
  onClose,
  detail,
  locale,
}: {
  open: boolean;
  onClose: () => void;
  detail: CalendarEventDetail | null;
  locale: Locale;
}) {
  if (!detail) return null;

  const when = formatEventWhen(detail.date, locale, {
    allDay: detail.allDay,
    startsAt: detail.startsAt,
    endsAt: detail.endsAt,
  });

  return (
    <BottomSheet open={open} onClose={onClose} title={detail.title}>
      <div className="flex flex-col gap-4 pb-2">
        {detail.subtitle ? (
          <p className="text-sm text-ink-faint">{detail.subtitle}</p>
        ) : null}

        <dl className="flex flex-col gap-3 text-sm">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-ink-faint">
              When
            </dt>
            <dd className="mt-0.5 text-ink">{when}</dd>
          </div>

          {detail.location ? (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-ink-faint">
                Where
              </dt>
              <dd className="mt-0.5 text-ink">{detail.location}</dd>
            </div>
          ) : null}

          {detail.description ? (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-ink-faint">
                Details
              </dt>
              <dd className="mt-0.5 whitespace-pre-wrap text-ink">
                {detail.description}
              </dd>
            </div>
          ) : null}

          {detail.notes ? (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-ink-faint">
                Note
              </dt>
              <dd className="mt-0.5 whitespace-pre-wrap text-ink">
                {detail.notes}
              </dd>
            </div>
          ) : null}

          {detail.url ? (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-ink-faint">
                Link
              </dt>
              <dd className="mt-0.5">
                <a
                  href={detail.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-action break-all"
                >
                  {detail.url}
                </a>
              </dd>
            </div>
          ) : null}
        </dl>
      </div>
    </BottomSheet>
  );
}
