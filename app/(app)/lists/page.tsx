import { Card } from "@/components/ui";
import { requireOnboarded } from "@/lib/household";
import { loadOutstandingCounts, loadShoppingLists } from "@/lib/shopping";
import ListsPanel from "./ListsPanel";

export const metadata = { title: "Lists · homeapp" };

export default async function ListsPage() {
  const { supabase, household } = await requireOnboarded();

  const [lists, counts] = await Promise.all([
    loadShoppingLists(supabase, household.id),
    loadOutstandingCounts(supabase, household.id),
  ]);

  const outstanding = Object.fromEntries(counts);
  const total = lists.reduce((sum, list) => sum + (outstanding[list.id] ?? 0), 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="px-1">
        <h1 className="text-2xl">Lists</h1>
        <p className="mt-0.5 text-sm text-ink-soft">
          The shopping, shared with everyone at {household.name}. Tick things
          off as they go in the basket.
        </p>
      </div>

      <Card
        title="Your lists"
        action={
          total > 0 ? (
            <span className="tnum text-xs text-ink-faint">{total} to get</span>
          ) : undefined
        }
      >
        <ListsPanel lists={lists} outstanding={outstanding} />
      </Card>

      <p className="px-1 pt-2 text-center text-xs text-ink-faint">
        Anyone in the household can add to a list and tick things off, and
        everyone sees the same one.
      </p>
    </div>
  );
}
