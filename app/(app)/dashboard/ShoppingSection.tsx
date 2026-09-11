import Link from "next/link";
import { ShoppingBasket } from "lucide-react";
import { Card } from "@/components/ui";
import {
  loadOutstandingCounts,
  loadShoppingLists,
  type ShoppingList,
} from "@/lib/shopping";
import { createClient } from "@/lib/supabase-server";

const SHOPPING_NAMES = 3;

export default async function ShoppingSection({
  householdId,
}: {
  householdId: string;
}) {
  const supabase = await createClient();
  const [lists, counts] = await Promise.all([
    loadShoppingLists(supabase, householdId),
    loadOutstandingCounts(supabase, householdId),
  ]);
  return <Shopping lists={lists} counts={counts} />;
}

function Shopping({
  lists,
  counts,
}: {
  lists: readonly ShoppingList[];
  counts: Map<string, number>;
}) {
  const outstanding = lists
    .map((list) => ({ list, count: counts.get(list.id) ?? 0 }))
    .filter(({ count }) => count > 0);
  if (outstanding.length === 0) return null;

  const total = outstanding.reduce((sum, { count }) => sum + count, 0);
  const named = outstanding
    .slice(0, SHOPPING_NAMES)
    .map(({ list, count }) => `${list.name} (${count})`)
    .join(" · ");
  const rest = outstanding.length - SHOPPING_NAMES;

  return (
    <Card padding="none">
      <Link href="/lists" className="flex items-center gap-3 px-4 py-3.5">
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pill bg-sage-tint text-sage"
        >
          <ShoppingBasket size={17} strokeWidth={1.9} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-ink">
            {total} {total === 1 ? "thing" : "things"} to get
          </span>
          <span className="block truncate text-xs text-ink-faint">
            {rest > 0 ? `${named} and ${rest} more` : named}
          </span>
        </span>
      </Link>
    </Card>
  );
}
