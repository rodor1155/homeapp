import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui";
import { requireOnboarded } from "@/lib/household";
import { loadShoppingItems, loadShoppingList, splitItems } from "@/lib/shopping";
import ItemsPanel from "./ItemsPanel";
import ListSettings from "./ListSettings";

type Props = { params: Promise<{ listId: string }> };

export const metadata = { title: "List · homeapp" };

export default async function ListPage({ params }: Props) {
  const { listId } = await params;
  const { supabase, user, household } = await requireOnboarded();

  const list = await loadShoppingList(supabase, household.id, listId);
  if (!list) notFound();

  const items = await loadShoppingItems(supabase, household.id, list.id);
  const { toGet, inBasket } = splitItems(items);

  return (
    <AppShell user={user}>
      <div className="flex flex-col gap-4">
        <div className="px-1">
          <Link
            href="/lists"
            className="text-action inline-flex items-center gap-1 text-sm"
          >
            <ChevronLeft size={15} strokeWidth={2} aria-hidden />
            All lists
          </Link>
          <h1 className="mt-1.5 text-2xl">{list.name}</h1>
          <p className="mt-0.5 text-sm text-ink-soft">
            {list.notes ??
              (toGet.length === 0
                ? "Nothing to get. Add what you need and everyone will see it."
                : `${toGet.length} to get${
                    inBasket.length > 0
                      ? `, ${inBasket.length} in the basket`
                      : ""
                  }.`)}
          </p>
        </div>

        <Card>
          <ItemsPanel listId={list.id} items={items} />
        </Card>

        <Card title="This list">
          <ListSettings list={list} />
        </Card>
      </div>
    </AppShell>
  );
}
