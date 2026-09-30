"use client";

import { clearOfflineCache } from "@/lib/clear-offline-cache";

export default function SignOutButton() {
  return (
    <form
      action="/auth/sign-out"
      method="post"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        // Always submit, even if clearing the offline cache fails.
        void clearOfflineCache()
          .catch(() => undefined)
          .then(() => {
            form.submit();
          });
      }}
    >
      <button type="submit" className="text-action text-sm">
        Sign out
      </button>
    </form>
  );
}
