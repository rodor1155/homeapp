import Link from "next/link";
import {
  CalendarDays,
  ChevronRight,
  FilePlus2,
  GraduationCap,
  Share2,
  ShoppingBasket,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui";
import { formatWeekdayDate } from "@/lib/dates";
import {
  calendarDayParts,
  loadHouseholdCalendars,
  loadHouseholdPeople,
  loadSchools,
} from "@/lib/family";
import type { Locale } from "@/lib/household";
import {
  helpfulHints,
  type HelpfulHint,
  type HintIcon,
} from "@/lib/helpful-hints";
import { loadShoppingLists } from "@/lib/shopping";
import { createClient } from "@/lib/supabase-server";
import { TONE_PILL, TONE_WASH, TONE_WASH_HOVER } from "@/lib/tones";
import { loadOverviewDocuments } from "./overview-data";

/* The morning's two or three suggestions. Everything it reads is either a
   loader another section already shares (documents) or a short list the
   household is small enough for, so this is cheap even though it streams on
   its own. Nothing to suggest renders nothing — no empty state. */

const HINT_ICON: Record<HintIcon, LucideIcon> = {
  people: Users,
  school: GraduationCap,
  calendar: CalendarDays,
  shared: Share2,
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
  const [peopleLoad, schoolsLoad, calendarsLoad, lists, documents] =
    await Promise.all([
      loadHouseholdPeople(supabase, householdId),
      loadSchools(supabase, householdId),
      loadHouseholdCalendars(supabase, householdId),
      loadShoppingLists(supabase, householdId),
      loadOverviewDocuments(householdId),
    ]);

  const people = peopleLoad.items;
  const schools = schoolsLoad.items;
  const calendars = calendarsLoad.items;

  const hints = helpfulHints({
    people,
    schools,
    calendars,
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
  const day = calendarDayParts();
  const today = `${day.year}-${String(day.month).padStart(2, "0")}-${String(day.day).padStart(2, "0")}`;

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
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${
                  TONE_WASH[hint.tone]
                } ${TONE_WASH_HOVER[hint.tone]}`}
              >
                <span
                  aria-hidden
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-pill ${
                    TONE_PILL[hint.tone]
                  }`}
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
