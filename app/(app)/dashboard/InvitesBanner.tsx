import Link from "next/link";
import { Card } from "@/components/ui";
import { loadPendingInvites } from "@/lib/invites";
import { createClient } from "@/lib/supabase-server";

export default async function InvitesBanner() {
  const supabase = await createClient();
  const invites = await loadPendingInvites(supabase);
  if (invites.length === 0) return null;

  return (
    <Card tone="accent">
      <h2 className="text-base font-semibold text-ink">
        {invites.length === 1
          ? `You’ve been invited to join ${invites[0].household_name}`
          : `You’ve been invited to join ${invites.length} households`}
      </h2>
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
