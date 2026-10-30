import { describe, expect, it } from "vitest";
import type { ComingUpEntry } from "@/lib/coming-up";
import { atlasActionsForComingUp } from "@/lib/atlas-deck-actions";

const actionsFor = (title: string) =>
  atlasActionsForComingUp({ title, url: null } as unknown as ComingUpEntry);

describe("atlasActionsForComingUp tax detection", () => {
  it.each(["Car tax", "Road tax", "VED renewal", "Vehicle tax due"])(
    "%s offers the vehicle-tax action",
    (title) => {
      const a = actionsFor(title);
      expect(a.bookLabel).toBe("Tax this vehicle");
      expect(a.bookUrl).toBe("https://www.gov.uk/vehicle-tax");
    },
  );

  it.each(["Council Tax", "council tax band D", "Tax return", "Approved", "Saved"])(
    "%s does not offer the vehicle-tax action",
    (title) => {
      const a = actionsFor(title);
      expect(a.bookLabel).toBeNull();
      expect(a.bookUrl).toBeNull();
    },
  );
});
