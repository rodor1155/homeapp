import type { HouseholdPerson } from "@/lib/family";
import { memberEdgeClass } from "@/lib/evening-map";

const DOT_CLASS: Record<string, string> = {
  "evening-edge-amber": "evening-status-dot--amber",
  "evening-edge-rose": "evening-status-dot--rose",
  "evening-edge-sky": "evening-status-dot--sky",
  "evening-edge-neutral": "evening-status-dot--neutral",
};

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
      const edge = memberEdgeClass(person.id, people);
      return { person, status, edge };
    })
    .filter(Boolean) as {
    person: HouseholdPerson;
    status: string;
    edge: string;
  }[];

  if (chips.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {chips.map(({ person, status, edge }) => (
        <span key={person.id} className="evening-status-chip evening-glass">
          <span
            aria-hidden
            className={`evening-status-dot ${DOT_CLASS[edge] ?? "evening-status-dot--neutral"}`}
          />
          <span className="truncate">
            {person.name} · {status}
          </span>
        </span>
      ))}
    </div>
  );
}
