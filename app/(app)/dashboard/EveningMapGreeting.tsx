"use client";

import { useSyncExternalStore } from "react";

function timeGreeting(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) return "Morning";
  if (hour < 17) return "Afternoon";
  return "Evening";
}

function subscribe() {
  return () => {};
}

function clientGreeting(): string {
  return timeGreeting(new Date());
}

export default function EveningMapGreeting({ firstName }: { firstName: string }) {
  const period = useSyncExternalStore(subscribe, clientGreeting, () => "");

  return (
    <h1 className="evening-greeting" suppressHydrationWarning>
      {period ? `${period}, ${firstName}` : `Hello, ${firstName}`}
    </h1>
  );
}
