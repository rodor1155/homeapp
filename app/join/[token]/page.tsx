import { notFound } from "next/navigation";
import PreAppShell from "@/components/PreAppShell";
import type { JoinView } from "@/components/invite/JoinHouseholdContent";
import { loadInviteLinkPreview } from "@/lib/invite-links";
import { createClient } from "@/lib/supabase-server";
import { appTitle } from "@/lib/brand";
import JoinPageClient from "./JoinPageClient";

export const metadata = {
  title: appTitle("Join household"),
  robots: { index: false, follow: false },
};

export default async function JoinPage(props: PageProps<"/join/[token]">) {
  const { token } = await props.params;
  const supabase = await createClient();
  const preview = await loadInviteLinkPreview(supabase, token);
  if (!preview) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const joinPath = `/join/${token}`;

  let view: JoinView;
  if (user && preview.already_member) {
    view = "already-member";
  } else if (preview.status !== "valid") {
    view = preview.status;
  } else if (!user) {
    view = "signed-out";
  } else {
    view = "confirm";
  }

  return (
    <PreAppShell>
      <JoinPageClient
        view={view}
        preview={preview}
        joinPath={joinPath}
        token={token}
      />
    </PreAppShell>
  );
}
