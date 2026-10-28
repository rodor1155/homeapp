import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* M6: a free household can't invite someone or add a family date by writing
   to household_invites / household_events straight through the Data API.

   No database here: the migration is checked as text (the revokes, and that
   each insert function checks membership and the plan before it writes), and
   the actions run against a mocked Supabase client to show paid households
   still get through the RPCs with the same results and messages. */

const MIGRATION = readFileSync(
  fileURLToPath(
    new URL(
      "../../supabase/migrations/20261028130000_paywall_gated_inserts.sql",
      import.meta.url
    )
  ),
  "utf8"
);

/** The migration with `--` comments removed, whitespace collapsed, lowercased. */
const SQL = MIGRATION.replace(/--[^\n]*/g, "")
  .replace(/\s+/g, " ")
  .toLowerCase();

/** The body of one `create or replace function public.<name>(…) … $$ … $$`. */
function functionSql(name: string): string {
  const start = SQL.indexOf(`create or replace function ${name}(`);
  expect(start, name).toBeGreaterThanOrEqual(0);
  const open = SQL.indexOf("$$", start);
  const close = SQL.indexOf("$$", open + 2);
  return SQL.slice(start, close + 2);
}

describe("migration 20261028130000_paywall_gated_inserts", () => {
  it("sorts after every other migration", async () => {
    const { readdirSync } = await import("node:fs");
    const files = readdirSync(
      fileURLToPath(new URL("../../supabase/migrations/", import.meta.url))
    ).sort();
    expect(files.at(-1)).toBe("20261028130000_paywall_gated_inserts.sql");
  });

  it("takes INSERT on both tables away from the Data API roles", () => {
    for (const table of ["household_invites", "household_events"]) {
      expect(SQL).toContain(
        `revoke insert on public.${table} from anon, authenticated;`
      );
      expect(SQL).toContain(`drop policy if exists ${table}_insert on public.${table};`);
      // Nothing grants it back.
      expect(SQL).not.toMatch(
        new RegExp(`grant[^;]*\\binsert\\b[^;]*on public\\.${table}`)
      );
    }
  });

  it("leaves clients only the UPDATE columns the app uses", () => {
    expect(SQL).toContain("revoke update on public.household_invites from anon, authenticated;");
    expect(SQL).toContain("grant update (status) on public.household_invites to authenticated;");
    expect(SQL).toContain("revoke update on public.household_events from anon, authenticated;");
    expect(SQL).toContain(
      "grant update (title, event_date, event_type, person_id, school_id, notes) on public.household_events to authenticated;"
    );
    // A client may only withdraw a pending invite, not re-open an old one.
    const guard = functionSql("private.household_invites_client_update_guard");
    expect(guard).toContain("current_user = 'authenticated'");
    expect(guard).toContain("old.status = 'pending' and new.status = 'revoked'");
    expect(SQL).toContain(
      "before update on public.household_invites for each row execute function private.household_invites_client_update_guard();"
    );
  });

  it("decides paid the same way lib/billing.ts does", () => {
    const paid = functionSql("private.household_has_paid_plan");
    expect(paid).toContain("security definer");
    expect(paid).toContain("set search_path = ''");
    expect(paid).toContain("s.status in ('active', 'trialing')");
    expect(paid).toContain("a.revoked_at is null");
    expect(paid).toContain(
      "pg_catalog.greatest(a.expires_at, a.grace_period_expires_at) > pg_catalog.now()"
    );
    expect(SQL).toContain(
      "revoke all on function private.household_has_paid_plan(uuid) from public, anon, authenticated;"
    );
  });

  for (const [fn, table, signature] of [
    [
      "public.create_household_invite",
      "household_invites",
      "public.create_household_invite(uuid, text, text, timestamptz)",
    ],
    [
      "public.create_household_event",
      "household_events",
      "public.create_household_event(uuid, text, date, text, uuid, uuid, text)",
    ],
  ] as const) {
    it(`${fn} checks membership and the plan before it inserts`, () => {
      const body = functionSql(fn);
      expect(body).toContain("security definer");
      expect(body).toContain("set search_path = ''");
      expect(body).toContain(`returns public.${table}`);

      const signedIn = body.indexOf("if _uid is null then");
      const member = body.indexOf(
        "from public.household_members m where m.household_id = p_household_id and m.user_id = _uid"
      );
      const plan = body.indexOf(
        "if not private.household_has_paid_plan(p_household_id) then raise exception 'plan_required'"
      );
      const insert = body.indexOf(`insert into public.${table}`);
      expect(body).toContain("_uid uuid := auth.uid();");
      for (const step of [signedIn, member, plan, insert]) {
        expect(step).toBeGreaterThan(0);
      }
      expect(signedIn).toBeLessThan(member);
      expect(member).toBeLessThan(plan);
      expect(plan).toBeLessThan(insert);
      expect(body).toContain("returning * into _row;");

      expect(SQL).toContain(`revoke all on function ${signature} from public, anon;`);
      expect(SQL).toContain(`grant execute on function ${signature} to authenticated;`);
      expect(SQL).not.toContain(`grant execute on function ${signature} to anon`);
    });
  }

  it("always records the caller as the inviter", () => {
    const body = functionSql("public.create_household_invite");
    expect(body).toContain("(p_household_id, p_email, p_token, p_expires_at, _uid, 'pending')");
  });

  it("keeps a new date's person and school inside the household", () => {
    const body = functionSql("public.create_household_event");
    expect(body).toContain("p.id = p_person_id and p.household_id = p_household_id");
    expect(body).toContain("s.id = p_school_id and s.household_id = p_household_id");
  });
});

// --- the actions, against a mocked Supabase ---------------------------------

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

vi.mock("@/lib/appstore/subscriptions", () => ({
  loadActiveAppStoreSubscription: async () => null,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));

const inserts = vi.fn();
const rpcs = vi.fn();
let rpcError: { message: string } | null = null;
let userEmail = "someone@example.com";

/** The signed-in client: reads answer with nothing, writes are recorded. */
function fakeSupabase() {
  const chain = (table: string): Record<string, unknown> => {
    const self: Record<string, unknown> = {
      select: () => self,
      eq: () => self,
      not: () => self,
      gt: () => self,
      ilike: () => self,
      order: () => self,
      limit: () => self,
      maybeSingle: async () => ({
        data: table === "household_invites" ? null : { household_id: HOUSEHOLD },
        error: null,
      }),
      insert: (row: unknown) => {
        inserts(table, row);
        // What PostgREST answers once INSERT is revoked.
        return Promise.resolve({
          error: { message: `permission denied for table ${table}` },
        });
      },
      update: () => self,
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
      if (fn === "household_member_emails") return { data: [], error: null };
      return { data: null, error: rpcError };
    },
  };
}

vi.mock("@/lib/supabase-server", () => ({
  createClient: async () => fakeSupabase(),
}));

import { saveEvent } from "@/app/actions/family";
import { createInviteLink } from "@/app/actions/invite-links";
import { inviteMember } from "@/app/actions/settings";
import { UPGRADE_MESSAGE } from "@/lib/billing";

function eventForm(): FormData {
  const form = new FormData();
  form.set("title", "Sports day");
  form.set("event_date", "2026-11-12");
  form.set("event_type", "school");
  form.set("notes", "Bring water");
  return form;
}

function emailForm(email: string): FormData {
  const form = new FormData();
  form.set("email", email);
  return form;
}

beforeEach(() => {
  vi.stubEnv("APPSTORE_APP_APPLE_ID", "6700000000");
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
  vi.stubEnv("REVIEW_DEMO_EMAIL", DEMO);
  subscription.mockReturnValue({ household_id: HOUSEHOLD, status: "active" });
  rpcError = null;
  userEmail = "someone@example.com";
  inserts.mockClear();
  rpcs.mockClear();
  adminInserts.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("a paid household, through the RPCs", () => {
  it("creates an invite link", async () => {
    const result = await createInviteLink();
    expect(result?.ok).toBe(true);
    const token = result?.url?.split("/join/")[1];
    expect(token?.length).toBeGreaterThanOrEqual(32);
    expect(rpcs).toHaveBeenCalledWith("create_household_invite", {
      p_household_id: HOUSEHOLD,
      p_email: null,
      p_token: token,
      p_expires_at: expect.any(String),
    });
    expect(inserts).not.toHaveBeenCalled();
    expect(adminInserts).not.toHaveBeenCalled();
  });

  it("invites by email", async () => {
    const result = await inviteMember(undefined, emailForm("Partner@Example.com"));
    expect(result).toEqual({ ok: true });
    expect(rpcs).toHaveBeenCalledWith("create_household_invite", {
      p_household_id: HOUSEHOLD,
      p_email: "partner@example.com",
      p_token: null,
      p_expires_at: null,
    });
    expect(inserts).not.toHaveBeenCalled();
  });

  it("adds a family date", async () => {
    const result = await saveEvent(undefined, eventForm());
    expect(result).toEqual({ ok: true });
    expect(rpcs).toHaveBeenCalledWith("create_household_event", {
      p_household_id: HOUSEHOLD,
      p_title: "Sports day",
      p_event_date: "2026-11-12",
      p_event_type: "school",
      p_person_id: null,
      p_school_id: null,
      p_notes: "Bring water",
    });
    expect(inserts).not.toHaveBeenCalled();
  });

  it("passes a database error straight back, as before", async () => {
    rpcError = { message: "duplicate key value violates unique constraint" };
    const result = await saveEvent(undefined, eventForm());
    expect(result).toEqual({ error: "duplicate key value violates unique constraint" });
  });
});

describe("when the database says the household is free", () => {
  // e.g. the subscription lapsed between the server's check and the write.
  beforeEach(() => {
    rpcError = { message: "plan_required" };
  });

  it("shows the paywall for a link invite", async () => {
    const result = await createInviteLink();
    expect(result).toEqual({ error: UPGRADE_MESSAGE.invite, upgrade: true });
  });

  it("shows the upgrade message for an email invite", async () => {
    const result = await inviteMember(undefined, emailForm("partner@example.com"));
    expect(result).toEqual({ error: UPGRADE_MESSAGE.invite });
  });

  it("shows the paywall for a family date", async () => {
    const result = await saveEvent(undefined, eventForm());
    expect(result).toEqual({ error: UPGRADE_MESSAGE.familyDates, upgrade: true });
  });
});

describe("a free household", () => {
  beforeEach(() => {
    subscription.mockReturnValue(null);
  });

  it("is stopped by the server before any write", async () => {
    expect((await createInviteLink())?.upgrade).toBe(true);
    expect((await saveEvent(undefined, eventForm()))?.upgrade).toBe(true);
    expect(await inviteMember(undefined, emailForm("partner@example.com"))).toEqual({
      error: UPGRADE_MESSAGE.invite,
    });
    expect(rpcs).not.toHaveBeenCalledWith("create_household_invite", expect.anything());
    expect(rpcs).not.toHaveBeenCalledWith("create_household_event", expect.anything());
    expect(adminInserts).not.toHaveBeenCalled();
  });
});

describe("paid by the server's say-so", () => {
  it("writes the App Review demo account's rows with the service role", async () => {
    subscription.mockReturnValue(null);
    userEmail = DEMO;
    expect((await createInviteLink())?.ok).toBe(true);
    expect(await saveEvent(undefined, eventForm())).toEqual({ ok: true });
    expect(adminInserts).toHaveBeenCalledWith(
      "household_invites",
      expect.objectContaining({ household_id: HOUSEHOLD, invited_by: "user-1", status: "pending" })
    );
    expect(adminInserts).toHaveBeenCalledWith(
      "household_events",
      expect.objectContaining({ household_id: HOUSEHOLD, title: "Sports day" })
    );
    expect(rpcs).not.toHaveBeenCalledWith("create_household_invite", expect.anything());
  });

  it("writes with the service role while billing is switched off", async () => {
    vi.stubEnv("APPSTORE_APP_APPLE_ID", "");
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    expect(await saveEvent(undefined, eventForm())).toEqual({ ok: true });
    expect(adminInserts).toHaveBeenCalledWith(
      "household_events",
      expect.objectContaining({ household_id: HOUSEHOLD })
    );
  });
});
