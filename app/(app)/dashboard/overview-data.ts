import "server-only";

import { cache } from "react";
import { DOCUMENTS_SELECT, type DocumentRow } from "@/lib/document-types";
import { OVERVIEW_STATUSES } from "@/lib/home-overview";
import { createClient } from "@/lib/supabase-server";

/**
 * The household's read documents — the rows the house file, "Coming up" and
 * the filing lists all want. Each of those streams behind its own boundary,
 * so they ask for this separately; memoised for the request, so it is still
 * one round trip and none of them waits on the others' reads.
 */
export const loadOverviewDocuments = cache(
  async (householdId: string): Promise<DocumentRow[]> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("documents")
      .select(DOCUMENTS_SELECT)
      .eq("household_id", householdId)
      .in("extraction_status", [...OVERVIEW_STATUSES])
      .order("created_at", { ascending: false });

    return (data as DocumentRow[] | null) ?? [];
  }
);
