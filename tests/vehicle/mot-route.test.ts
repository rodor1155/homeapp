import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { INVALID_REGISTRATION_MESSAGE } from "@/lib/registration";

/* POST /api/vehicle/mot: DVSA's quota is shared by everyone, so nothing reaches
   lookupMot() unless the caller is a household member, inside their burst
   allowance, and inside the durable daily caps. No real database: the session
   client and the admin client are both fakes, and the admin client's RPC is a
   small in-memory stand-in for public.consume_mot_lookup() whose state lives
   outside the route module — the same way the Postgres table outlives an
   isolate — so re-importing the route models a cold start. */

const h = vi.hoisted(() => {
  const counters = new Map<string, number>();
  return {
    getUser: vi.fn(),
    membership: { value: null as unknown },
    lookupMot: vi.fn(),
    counters,
    rpcError: { value: null as { message: string } | null },
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      if (name !== "consume_mot_lookup") throw new Error(`unexpected rpc ${name}`);
      // Mirrors the SQL: check user then global, count both only on success.
      const user = String(args.p_user_id);
      const userCount = counters.get(user) ?? 0;
      const globalCount = counters.get("*") ?? 0;
      if (userCount >= Number(args.p_user_limit)) return { data: "user_limit", error: null };
      if (globalCount >= Number(args.p_global_limit)) return { data: "global_limit", error: null };
      counters.set(user, userCount + 1);
      counters.set("*", globalCount + 1);
      return { data: "ok", error: null };
    }),
  };
});

vi.mock("@/lib/supabase-server", () => ({
  createClient: async () => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: async () => ({ data: h.membership.value, error: null }),
    };
    return { auth: { getUser: h.getUser }, from: () => chain };
  },
}));

vi.mock("@/lib/supabase-admin", () => ({
  createAdminClient: () => ({
    rpc: (name: string, args: Record<string, unknown>) =>
      h.rpcError.value ? Promise.resolve({ data: null, error: h.rpcError.value }) : h.rpc(name, args),
  }),
}));

vi.mock("@/lib/mot", () => ({
  lookupMot: h.lookupMot,
  MotLookupError: class MotLookupError extends Error {},
}));

const MEMBER_ROW = {
  households: { id: "household-1", name: "The Ellners", locale: "UK", properties: [] },
};

type Route = typeof import("@/app/api/vehicle/mot/route");
let route: Route;

/** A fresh module graph: new rate-limit buckets, new everything in memory. */
async function coldStart(): Promise<Route> {
  vi.resetModules();
  return import("@/app/api/vehicle/mot/route");
}

function post(registration = "FG11 VXY") {
  return route.POST(
    new Request("https://homeapp.test/api/vehicle/mot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ registration }),
    })
  );
}

function signInAs(id: string) {
  h.getUser.mockResolvedValue({ data: { user: { id, email: `${id}@example.com` } } });
}

beforeEach(async () => {
  h.counters.clear();
  h.rpcError.value = null;
  h.rpc.mockClear();
  h.lookupMot.mockReset();
  h.lookupMot.mockResolvedValue({ found: false });
  h.membership.value = MEMBER_ROW;
  signInAs("11111111-1111-4111-8111-111111111111");
  route = await coldStart();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/vehicle/mot", () => {
  it("answers 401 when nobody is signed in", async () => {
    h.getUser.mockResolvedValue({ data: { user: null } });
    const response = await post();
    expect(response.status).toBe(401);
    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.lookupMot).not.toHaveBeenCalled();
  });

  it("answers 403 to a signed-in user who isn't in a household, before any DVSA call", async () => {
    h.membership.value = null;
    const response = await post();
    expect(response.status).toBe(403);
    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.lookupMot).not.toHaveBeenCalled();
  });

  it("looks the registration up for a household member", async () => {
    h.lookupMot.mockResolvedValue({ found: true, registration: "FG11VXY" });
    const response = await post();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ found: true });
    expect(h.lookupMot).toHaveBeenCalledWith("FG11VXY");
  });

  it("normalises spaces, hyphens and case before calling DVSA", async () => {
    h.lookupMot.mockResolvedValue({ found: true, registration: "AB12CDE" });
    const response = await post("ab-12 cde");
    expect(response.status).toBe(200);
    expect(h.lookupMot).toHaveBeenCalledTimes(1);
    expect(h.lookupMot).toHaveBeenCalledWith("AB12CDE");
  });

  it.each(["..", "AB/12", "", "A", "ABCDEFGHI", "FG11 VXY;"])(
    "answers 400 to %j without calling DVSA or spending quota",
    async (registration) => {
      const response = await post(registration);
      expect(response.status).toBe(400);
      expect((await response.json()).error).toBe(INVALID_REGISTRATION_MESSAGE);
      expect(h.rpc).not.toHaveBeenCalled();
      expect(h.lookupMot).not.toHaveBeenCalled();
    }
  );

  it("doesn't let invalid registrations use up the burst allowance", async () => {
    for (let i = 0; i < 10; i++) expect((await post("..")).status).toBe(400);
    expect((await post()).status).toBe(200);
    expect(h.lookupMot).toHaveBeenCalledTimes(1);
  });

  it("answers 429 to a burst, without calling DVSA for the excess", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) statuses.push((await post()).status);
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429, 429, 429]);
    expect(h.lookupMot).toHaveBeenCalledTimes(5);
    // Burst refusals never reach the durable counter either.
    expect(h.rpc).toHaveBeenCalledTimes(5);
  });

  it("holds the per-user daily cap across a cold start", async () => {
    vi.stubEnv("MOT_LOOKUP_USER_DAILY_LIMIT", "3");
    for (let i = 0; i < 3; i++) expect((await post()).status).toBe(200);
    expect((await post()).status).toBe(429);
    expect(h.lookupMot).toHaveBeenCalledTimes(3);

    // New isolate: the in-memory burst buckets are gone, the durable counter isn't.
    route = await coldStart();
    const response = await post();
    expect(response.status).toBe(429);
    expect((await response.json()).error).toMatch(/today/);
    expect(h.lookupMot).toHaveBeenCalledTimes(3);

    // Someone else in the same household still has their own allowance.
    signInAs("22222222-2222-4222-8222-222222222222");
    expect((await post()).status).toBe(200);
    expect(h.lookupMot).toHaveBeenCalledTimes(4);
  });

  it("holds the global daily cap across users and cold starts", async () => {
    vi.stubEnv("MOT_LOOKUP_GLOBAL_DAILY_LIMIT", "2");
    expect((await post()).status).toBe(200);
    signInAs("22222222-2222-4222-8222-222222222222");
    expect((await post()).status).toBe(200);

    route = await coldStart();
    signInAs("33333333-3333-4333-8333-333333333333");
    expect((await post()).status).toBe(429);
    expect(h.lookupMot).toHaveBeenCalledTimes(2);
  });

  it("passes env-overridden limits to the counter, and defaults for junk values", async () => {
    vi.stubEnv("MOT_LOOKUP_USER_DAILY_LIMIT", "7");
    vi.stubEnv("MOT_LOOKUP_GLOBAL_DAILY_LIMIT", "not-a-number");
    await post();
    expect(h.rpc).toHaveBeenCalledWith("consume_mot_lookup", {
      p_user_id: "11111111-1111-4111-8111-111111111111",
      p_user_limit: 7,
      p_global_limit: 500,
    });
  });

  it("fails closed with 503 when the daily counter can't be reached", async () => {
    h.rpcError.value = { message: "function public.consume_mot_lookup does not exist" };
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await post();
    errors.mockRestore();
    expect(response.status).toBe(503);
    expect(h.lookupMot).not.toHaveBeenCalled();
  });

  it("answers 400 to a missing registration without spending quota", async () => {
    const response = await post("   ");
    expect(response.status).toBe(400);
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("answers 400 to a non-string registration", async () => {
    const response = await route.POST(
      new Request("https://homeapp.test/api/vehicle/mot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registration: 1234 }),
      })
    );
    expect(response.status).toBe(400);
    expect(h.lookupMot).not.toHaveBeenCalled();
  });
});

describe("migration 20261028120000_mot_lookup_daily_usage.sql", () => {
  const sql = readFileSync(
    fileURLToPath(
      new URL("../../supabase/migrations/20261028120000_mot_lookup_daily_usage.sql", import.meta.url)
    ),
    "utf8"
  )
    .replace(/--.*$/gm, "")
    .toLowerCase();

  it("keeps the counter table service-role only, with RLS on", () => {
    expect(sql).toContain("alter table public.mot_lookup_daily_usage enable row level security");
    expect(sql).toContain("revoke all on public.mot_lookup_daily_usage from anon, authenticated");
    expect(sql).toContain("grant all on public.mot_lookup_daily_usage to service_role");
    expect(sql).not.toMatch(/grant [^;]* on public\.mot_lookup_daily_usage to [^;]*(anon|authenticated)/);
  });

  it("increments through a SECURITY DEFINER function with a pinned search_path, executable by service_role only", () => {
    expect(sql).toContain("function public.consume_mot_lookup(");
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain(
      "revoke all on function public.consume_mot_lookup(uuid, integer, integer) from public, anon, authenticated"
    );
    expect(sql).toContain(
      "grant execute on function public.consume_mot_lookup(uuid, integer, integer) to service_role"
    );
    expect(sql).not.toMatch(/grant execute on function public\.consume_mot_lookup[^;]*(anon|authenticated)/);
  });

  it("locks the counter rows before checking them, so concurrent lookups can't race past the cap", () => {
    expect(sql.match(/for update/g)?.length).toBe(2);
  });
});
