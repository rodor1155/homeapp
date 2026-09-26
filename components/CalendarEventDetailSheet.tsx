"use client";

import BottomSheet from "@/components/BottomSheet";
import CalendarEventDetailBody from "@/components/CalendarEventDetailBody";
import type { CalendarEventDetail } from "@/lib/calendar-event-detail";
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

  return (
    <BottomSheet open={open} onClose={onClose} title={detail.title}>
      <CalendarEventDetailBody detail={detail} locale={locale} />
    </BottomSheet>
  );
}
