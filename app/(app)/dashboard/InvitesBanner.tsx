import Link from "next/link";
import { Card } from "@/components/ui";
import { loadPendingInvites } from "@/lib/invites";
import { createClient } from "@/lib/supabase-server";

export default async function InvitesBanner({
  variant = "paper",
}: {
  variant?: "paper" | "evening";
}) {
  const supabase = await createClient();
  const invites = await loadPendingInvites(supabase);
  if (invites.length === 0) return null;

  const title =
    invites.length === 1
      ? `You’ve been invited to join ${invites[0].household_name}`
      : `You’ve been invited to join ${invites.length} households`;

  if (variant === "evening") {
    return (
      <div className="evening-glass rounded-[var(--radius-lg)] p-3.5 text-white">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="mt-1 text-xs text-slate-muted">
          Accepting shares that household’s documents, dates and contacts with
          you.
        </p>
        <Link
          href="/invite"
          className="evening-file-pill evening-glass mt-3 inline-flex bg-amber/15 text-amber"
        >
          See the invitation
        </Link>
      </div>
    );
  }

  return (
    <Card tone="accent">
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Accepting shares that household’s documents, dates and contacts with
        you.
      </p>
      <Link href="/invite" className="btn mt-4">
        See the invitation
      </Link>
    </Card>
  );
}
