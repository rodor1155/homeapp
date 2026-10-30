import { afterEach, describe, expect, it, vi } from "vitest";

/* Records every table a loader touches. The fake query builder is thenable and
   chainable, resolving to an empty result (or a fixed row for maybeSingle). */
const tables: string[] = [];

function fakeClient() {
  return {
    from(table: string) {
      tables.push(table);
      const result = { data: [] as unknown[], error: null };
      const row =
        table === "person_kid_links"
          ? { person_id: "p1", household_id: "h1" }
          : table === "household_people"
            ? {
                id: "p1",
                name: "Sophie Test",
                kind: "child",
                school_id: null,
                birthday: null,
                colour: null,
                sort_order: 0,
              }
            : null;
      const chain: Record<string, unknown> = {};
      for (const m of [
        "select",
        "eq",
        "neq",
        "gte",
        "lte",
        "lt",
        "gt",
        "in",
        "order",
        "limit",
      ]) {
        chain[m] = () => chain;
      }
      chain.maybeSingle = () => Promise.resolve({ data: row, error: null });
      chain.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve(result).then(res, rej);
      return chain;
    },
  };
}

vi.mock("@/lib/supabase-server", () => ({
  createClient: async () => fakeClient(),
}));
vi.mock("@/lib/supabase-admin", () => ({ createAdminClient: () => fakeClient() }));

afterEach(() => {
  tables.length = 0;
  vi.resetModules();
  vi.doUnmock("@/lib/whos-where");
});

async function enableFlag(enabled: boolean) {
  vi.doMock("@/lib/whos-where", async () => {
    const actual =
      await vi.importActual<typeof import("@/lib/whos-where")>(
        "@/lib/whos-where"
      );
    return { ...actual, WHOS_WHERE_ENABLED: enabled };
  });
}

describe("Who's where launch flag", () => {
  it("ships switched off", async () => {
    const { WHOS_WHERE_ENABLED } = await import("@/lib/whos-where");
    expect(WHOS_WHERE_ENABLED).toBe(false);
  });

  it("hub-data does not query person_day_status and returns no rows when off", async () => {
    await enableFlag(false);
    const { loadHubData } = await import("@/lib/hub-data");
    const data = await loadHubData("h1");
    expect(tables).not.toContain("person_day_status");
    expect(data.whosWhere).toEqual([]);
  });

  it("hub-data queries person_day_status when on", async () => {
    await enableFlag(true);
    const { loadHubData } = await import("@/lib/hub-data");
    await loadHubData("h1");
    expect(tables).toContain("person_day_status");
  });

  it("kid-view-load does not query person_day_status and shows no status when off", async () => {
    await enableFlag(false);
    const { loadKidViewForToken } = await import("@/lib/kid-view-load");
    const payload = await loadKidViewForToken("t".repeat(43));
    expect(payload).not.toBeNull();
    expect(tables).not.toContain("person_day_status");
    expect(payload!.days.every((d) => d.whosWhere === null)).toBe(true);
  });

  it("kid-view-load queries person_day_status when on", async () => {
    await enableFlag(true);
    const { loadKidViewForToken } = await import("@/lib/kid-view-load");
    await loadKidViewForToken("t".repeat(43));
    expect(tables).toContain("person_day_status");
  });
});
