import Link from "next/link";
import {
  CalendarDays,
  ChevronRight,
  FilePlus2,
  GraduationCap,
  ShoppingBasket,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui";
import { formatWeekdayDate } from "@/lib/dates";
import { loadHouseholdPeople, loadSchools } from "@/lib/family";
import type { Locale } from "@/lib/household";
import {
  helpfulHints,
  type HelpfulHint,
  type HintIcon,
} from "@/lib/helpful-hints";
import { loadShoppingLists } from "@/lib/shopping";
import { createClient } from "@/lib/supabase-server";
import { loadOverviewDocuments } from "./overview-data";

/* The morning's two or three suggestions. Everything it reads is either a
   loader another section already shares (documents) or a short list the
   household is small enough for, so this is cheap even though it streams on
   its own. Nothing to suggest renders nothing — no empty state. */

const HINT_ICON: Record<HintIcon, LucideIcon> = {
  people: Users,
  school: GraduationCap,
  calendar: CalendarDays,
  basket: ShoppingBasket,
  file: FilePlus2,
};

export default async function HelpfulHintsSection({
  householdId,
  locale,
}: {
  householdId: string;
  locale: Locale;
}) {
  const supabase = await createClient();
  const [people, schools, lists, documents] = await Promise.all([
    loadHouseholdPeople(supabase, householdId),
    loadSchools(supabase, householdId),
    loadShoppingLists(supabase, householdId),
    loadOverviewDocuments(householdId),
  ]);

  const hints = helpfulHints({
    people,
    schools,
    listCount: lists.length,
    documentCount: documents.length,
  });

  return <HelpfulHints hints={hints} locale={locale} />;
}

function HelpfulHints({
  hints,
  locale,
}: {
  hints: readonly HelpfulHint[];
  locale: Locale;
}) {
  if (hints.length === 0) return null;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <Card
      title="Helpful hints"
      action={
        <span className="text-xs text-ink-faint">
          {formatWeekdayDate(today, locale)}
        </span>
      }
    >
      <ul className="flex flex-col gap-2">
        {hints.map((hint) => {
          const Icon = HINT_ICON[hint.icon];
          return (
            <li key={hint.key}>
              <Link
                href={hint.href}
                className="flex items-center gap-3 rounded-lg bg-sage-wash px-3 py-2.5 transition-colors hover:bg-sage-tint"
              >
                <span
                  aria-hidden
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pill bg-sage-tint text-sage"
                >
                  <Icon size={17} strokeWidth={1.9} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-ink">
                    {hint.title}
                  </span>
                  <span className="block text-xs text-ink-soft">
                    {hint.body}
                  </span>
                </span>
                <ChevronRight
                  size={16}
                  strokeWidth={1.9}
                  aria-hidden
                  className="shrink-0 text-ink-faint"
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
