import { MapPin } from "lucide-react";
import { Card } from "@/components/ui";
import { loadHouseholdPeople } from "@/lib/family";
import { createClient } from "@/lib/supabase-server";
import {
  loadPersonDayStatuses,
  todayIso,
} from "@/lib/whos-where";
import WhosWhereEditor from "./WhosWhereEditor";

export default async function WhosWhereSection({
  householdId,
}: {
  householdId: string;
}) {
  const supabase = await createClient();
  const date = todayIso();
  const [peopleLoad, statusLoad] = await Promise.all([
    loadHouseholdPeople(supabase, householdId),
    loadPersonDayStatuses(supabase, householdId, date),
  ]);

  const people = peopleLoad.items;
  if (people.length === 0) return null;

  const byPerson = new Map(
    statusLoad.items.map((s) => [s.person_id, s.status_text])
  );

  return (
    <Card
      title="Who’s where"
      action={
        <span className="flex items-center gap-1 text-xs text-ink-faint">
          <MapPin size={12} strokeWidth={1.9} aria-hidden />
          Today
        </span>
      }
    >
      {statusLoad.fault || peopleLoad.fault ? (
        <p role="status" className="mb-2 text-sm text-oxblood">
          {statusLoad.fault || peopleLoad.fault}
        </p>
      ) : null}
      <WhosWhereEditor
        people={people}
        statuses={Object.fromEntries(byPerson)}
        statusDate={date}
      />
    </Card>
  );
}
