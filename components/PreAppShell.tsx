import type { ReactNode } from "react";
import AppMark from "@/components/AppMark";
import { Wordmark } from "@/components/ui";

export const APP_TAGLINE =
  "A calm home for the paperwork that protects your household.";

/** Shared layout for sign-in, sign-up, invite (signed out) and onboarding. */
export default function PreAppShell({ children }: { children: ReactNode }) {
  return (
    <div className="pre-app-ground">
      <div className="mx-auto flex min-h-dvh w-full max-w-[27rem] flex-col justify-center gap-6 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))]">
      <header className="flex flex-col items-center gap-2 text-center">
        <div className="flex items-center gap-2.5">
          <AppMark size="md" />
          <Wordmark className="text-lg" />
        </div>
        <p className="max-w-[18rem] text-sm leading-relaxed text-ink-soft">
          {APP_TAGLINE}
        </p>
      </header>
        {children}
      </div>
    </div>
  );
}
