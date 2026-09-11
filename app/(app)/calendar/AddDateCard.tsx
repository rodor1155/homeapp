"use client";

import { useCallback, useState } from "react";
import EventForm from "@/components/EventForm";
import { Button, Card } from "@/components/ui";
import type { HouseholdPerson } from "@/lib/family";

/* "Add a date" without leaving the month you are looking at. The form is the
   same one /family puts up (components/EventForm.tsx) and it writes through
   the same `saveEvent`, so a date added here shows up on Family and the home
   screen too — there is no second kind of key date.

   `defaultDate` is the first of the month on screen, so adding something to
   November from November's page doesn't open the date field on today. */

export default function AddDateCard({
  people,
  defaultDate,
  monthLabel,
}: {
  people: HouseholdPerson[];
  defaultDate: string;
  monthLabel: string;
}) {
  const [adding, setAdding] = useState(false);
  const stopAdding = useCallback(() => setAdding(false), []);

  return (
    <Card title={adding ? "A new date" : undefined}>
      {adding ? (
        <EventForm
          people={people}
          defaultDate={defaultDate}
          onDone={stopAdding}
          submitLabel="Add it"
        />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink-soft">
            Something on in {monthLabel}? Put it on the calendar.
          </p>
          <Button
            type="button"
            variant="quiet"
            onClick={() => setAdding(true)}
            className="shrink-0"
          >
            Add a date
          </Button>
        </div>
      )}
    </Card>
  );
}
