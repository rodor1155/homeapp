"use client";

import { useEffect, useState } from "react";

const LONDON = "Europe/London";

function formatTime(now: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: LONDON,
  }).format(now);
}

function formatDate(now: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: LONDON,
  }).format(now);
}

/** Live London clock for the hub header — ticks every minute. */
export default function HubClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="text-right">
      <p className="tnum text-4xl font-semibold leading-none text-ink sm:text-5xl">
        {formatTime(now)}
      </p>
      <p className="mt-1 text-lg text-ink-soft">{formatDate(now)}</p>
    </div>
  );
}
