import type { CSSProperties } from "react";
import type { HouseholdPerson } from "@/lib/family";
import { memberColourStyle, personColourById } from "@/lib/member-colours";

export default function WhosWhereChips({
  people,
  statuses,
}: {
  people: readonly HouseholdPerson[];
  statuses: Record<string, string>;
}) {
  const chips = people
    .map((person) => {
      const status = statuses[person.id]?.trim();
      if (!status) return null;
      const colour = personColourById(person.id, people);
      return { person, status, colour };
    })
    .filter(Boolean) as {
    person: HouseholdPerson;
    status: string;
    colour: ReturnType<typeof personColourById>;
  }[];

  if (chips.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {chips.map(({ person, status, colour }) => (
        <span key={person.id} className="evening-status-chip evening-glass">
          <span
            aria-hidden
            className="evening-status-dot"
            style={
              colour
                ? memberColourStyle(colour)
                : ({ "--member-dot": "var(--member-neutral)" } as CSSProperties)
            }
          />
          <span className="truncate">
            {person.name} · {status}
          </span>
        </span>
      ))}
    </div>
  );
}
