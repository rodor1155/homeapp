"use client";

import { useState, type ReactNode } from "react";
import CalendarEventDetailSheet from "@/components/CalendarEventDetailSheet";
import type { CalendarEventDetail } from "@/lib/calendar-event-detail";
import type { Locale } from "@/lib/household";

export default function ComingUpTappableRow({
  detail,
  locale,
  className,
  children,
}: {
  detail: CalendarEventDetail;
  locale: Locale;
  className: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={`w-full text-left ${className}`}
        onClick={() => setOpen(true)}
      >
        {children}
      </button>
      <CalendarEventDetailSheet
        open={open}
        onClose={() => setOpen(false)}
        detail={detail}
        locale={locale}
      />
    </>
  );
}
