import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* The free solo tier: one person, five renewals. A household is free when
   billing is on and neither provider says it has paid; the gated actions
   refuse it on the server whatever the client shows. */

const HOUSEHOLD = "5b0e1f0a-6c62-4b0c-9a55-0d6f0f5f7a11";
const DEMO = "review@example.com";

const subscription = vi.fn();
const adminInserts = vi.fn();
vi.mock("@/lib/supabase-admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: subscription(), error: null }) }),
      }),
      insert: async (row: unknown) => {
        adminInserts(table, row);
        return { error: null };
      },
    }),
  }),
}));

const appStoreSubscription = vi.fn();
vi.mock("@/lib/appstore/subscriptions", () => ({
  loadActiveAppStoreSubscription: async () => appStoreSubscription(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));

const inserts = vi.fn();
const updates = vi.fn();
const rpcs = vi.fn();
let userEmail = "someone@example.com";

/** A cookie client that records writes and answers every read with nothing. */
function fakeSupabase() {
  const chain = (table: string): Record<string, unknown> => {
    const self: Record<string, unknown> = {
      select: () => self,
      eq: () => self,
      not: () => self,
      gt: () => self,
      order: () => self,
      limit: () => self,
      maybeSingle: async () => ({ data: { household_id: HOUSEHOLD }, error: null }),
      insert: (row: unknown) => {
        inserts(table, row);
        return Promise.resolve({ error: null });
      },
      update: (row: unknown) => {
        updates(table, row);
        return self;
      },
      then: (resolve: (value: unknown) => void) =>
        resolve({ data: [], count: 0, error: null }),
    };
    return self;
  };
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: "user-1", email: userEmail } } }),
    },
    from: chain,
    rpc: async (fn: string, args: unknown) => {
      rpcs(fn, args);
      return { data: null, error: null };
    },
  };
}

vi.mock("@/lib/supabase-server", () => ({
  createClient: async () => fakeSupabase(),
}));

import { saveEvent } from "@/app/actions/family";
import { createInviteLink } from "@/app/actions/invite-links";
import { getEntitlements } from "@/lib/billing";
import { FREE_RENEWAL_LIMIT } from "@/lib/plan";

function eventForm(fields: Record<string, string>): FormData {
  const form = new FormData();
  form.set("title", "Autumn term starts");
  form.set("event_date", "2026-11-02");
  form.set("event_type", "home");
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return form;
}

beforeEach(() => {
  vi.stubEnv("APPSTORE_APP_APPLE_ID", "6700000000");
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
  vi.stubEnv("REVIEW_DEMO_EMAIL", DEMO);
  subscription.mockReturnValue(null);
  appStoreSubscription.mockReturnValue(null);
  inserts.mockClear();
  updates.mockClear();
  rpcs.mockClear();
  adminInserts.mockClear();
  userEmail = "someone@example.com";
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getEntitlements", () => {
  it("puts a household that has not paid on the free solo tier", async () => {
    const free = await getEntitlements(HOUSEHOLD, { userEmail });
    expect(free).toMatchObject({
      plan: "free",
      canInvite: false,
      canAddFamilyDates: false,
      hasDocumentVault: false,
      canExport: false,
      renewalLimit: FREE_RENEWAL_LIMIT,
    });
    expect(FREE_RENEWAL_LIMIT).toBe(5);
  });

  it("gives a household with a Stripe subscription everything, trial included", async () => {
    for (const status of ["active", "trialing"]) {
      subscription.mockReturnValue({ household_id: HOUSEHOLD, status });
      const paid = await getEntitlements(HOUSEHOLD, { userEmail });
      expect(paid, status).toMatchObject({
        plan: "paid",
        source: "stripe",
        canInvite: true,
        canAddFamilyDates: true,
        hasDocumentVault: true,
        renewalLimit: null,
      });
    }
  });

  it("gives a household with an App Store subscription everything", async () => {
    appStoreSubscription.mockReturnValue({
      expires_at: "2027-01-01T00:00:00Z",
      grace_period_expires_at: null,
      revoked_at: null,
      auto_renew: true,
    });
    // Whoever in the household is asking: the plan belongs to the household.
    const paid = await getEntitlements(HOUSEHOLD, { userEmail: "partner@example.com" });
    expect(paid).toMatchObject({
      plan: "paid",
      source: "app_store",
      canInvite: true,
      renewalLimit: null,
    });
  });

  it("keeps the App Review demo account on the paid plan with no subscription", async () => {
    const demo = await getEntitlements(HOUSEHOLD, { userEmail: DEMO.toUpperCase() });
    expect(demo).toMatchObject({
      plan: "paid",
      source: "review_demo",
      canInvite: true,
      canAddFamilyDates: true,
      hasDocumentVault: true,
      renewalLimit: null,
    });
  });

  it("leaves every gate open while billing is switched off", async () => {
    vi.stubEnv("APPSTORE_APP_APPLE_ID", "");
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    const open = await getEntitlements(HOUSEHOLD, { userEmail });
    expect(open).toMatchObject({ plan: "paid", source: "unconfigured", renewalLimit: null });
  });
});

describe("inviting someone", () => {
  it("is refused on the free plan and asks for the paywall", async () => {
    const result = await createInviteLink();
    expect(result?.upgrade).toBe(true);
    expect(result?.url).toBeUndefined();
    expect(inserts).not.toHaveBeenCalled();
    expect(rpcs).not.toHaveBeenCalled();
  });

  it("still works for a paid household", async () => {
    subscription.mockReturnValue({ household_id: HOUSEHOLD, status: "active" });
    const result = await createInviteLink();
    expect(result?.ok).toBe(true);
    expect(result?.url).toContain("/join/");
    expect(rpcs).toHaveBeenCalledWith(
      "create_household_invite",
      expect.objectContaining({ p_household_id: HOUSEHOLD })
    );
    expect(inserts).not.toHaveBeenCalled();
  });

  it("still works for the App Review demo account", async () => {
    userEmail = DEMO;
    const result = await createInviteLink();
    expect(result?.ok).toBe(true);
    // The database can't see REVIEW_DEMO_EMAIL, so the server writes it.
    expect(adminInserts).toHaveBeenCalledWith(
      "household_invites",
      expect.objectContaining({ household_id: HOUSEHOLD, status: "pending" })
    );
  });
});

describe("family dates", () => {
  it("cannot be added on the free plan", async () => {
    const result = await saveEvent(undefined, eventForm({}));
    expect(result?.upgrade).toBe(true);
    expect(inserts).not.toHaveBeenCalled();
    expect(rpcs).not.toHaveBeenCalled();
  });

  it("that already exist can still be changed on the free plan", async () => {
    const result = await saveEvent(undefined, eventForm({ event_id: "event-1" }));
    expect(result).toEqual({ ok: true });
    expect(updates).toHaveBeenCalledWith(
      "household_events",
      expect.objectContaining({ title: "Autumn term starts" })
    );
  });

  it("can be added by a paid household", async () => {
    subscription.mockReturnValue({ household_id: HOUSEHOLD, status: "active" });
    const result = await saveEvent(undefined, eventForm({}));
    expect(result).toEqual({ ok: true });
    expect(rpcs).toHaveBeenCalledWith(
      "create_household_event",
      expect.objectContaining({ p_household_id: HOUSEHOLD, p_title: "Autumn term starts" })
    );
    expect(inserts).not.toHaveBeenCalled();
  });
});
