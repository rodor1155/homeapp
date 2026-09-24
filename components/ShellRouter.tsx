"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import AppShell, { type ShellUser } from "@/components/AppShell";
import HubShell from "@/components/HubShell";

function isHubPath(pathname: string): boolean {
  return pathname === "/hub" || pathname.startsWith("/hub/");
}

export default function ShellRouter({
  user,
  householdName,
  children,
}: {
  user: ShellUser;
  householdName: string;
  children: ReactNode;
}) {
  const pathname = usePathname();

  if (isHubPath(pathname)) {
    return <HubShell householdName={householdName}>{children}</HubShell>;
  }

  const hideHeader = pathname === "/dashboard";

  return (
    <AppShell user={user} hideHeader={hideHeader}>
      {children}
    </AppShell>
  );
}
