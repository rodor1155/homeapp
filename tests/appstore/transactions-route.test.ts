import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/* POST /api/appstore/transactions: the device is not trusted. A transaction
   that Apple did not sign is a 400 and never reaches the database. */

const adminCalls = vi.fn();
vi.mock("@/lib/supabase-admin", () => ({
  createAdminClient: () => {
    adminCalls();
    throw new Error("the database must not be touched by an unverified transaction");
  },
}));

const getUser = vi.fn();
vi.mock("@/lib/supabase-server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));

import { POST } from "@/app/api/appstore/transactions/route";
import { createFakeChain, transactionPayload, unsignedJws, type FakeChain } from "./fixtures";

function post(body: string | undefined) {
  return POST(
    new Request("https://homeapp.test/api/appstore/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    })
  );
}

let chain: FakeChain;

beforeAll(() => {
  chain = createFakeChain();
});

beforeEach(() => {
  adminCalls.mockClear();
  getUser.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: "user-1", email: "a@example.com" } } });
});

describe("POST /api/appstore/transactions", () => {
  it("answers 400 to malformed bodies", async () => {
    const bodies = [
      undefined,
      "nope",
      "[]",
      "{}",
      '{"signedTransaction": 5}',
      '{"signedTransactions": []}',
      '{"signedTransactions": ["a.b.c", 7]}',
      JSON.stringify({ signedTransactions: Array.from({ length: 11 }, () => "a.b.c") }),
    ];
    for (const body of bodies) {
      const response = await post(body);
      expect(response.status, String(body)).toBe(400);
    }
    expect(adminCalls).not.toHaveBeenCalled();
  });

  it("answers 401 when nobody is signed in", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const response = await post(JSON.stringify({ signedTransaction: chain.signJws(transactionPayload()) }));
    expect(response.status).toBe(401);
    expect(adminCalls).not.toHaveBeenCalled();
  });

  it("answers 400 to an unsigned transaction", async () => {
    const response = await post(
      JSON.stringify({ signedTransaction: unsignedJws(transactionPayload()) })
    );
    expect(response.status).toBe(400);
    expect(adminCalls).not.toHaveBeenCalled();
  });

  it("answers 400 to a transaction signed by a chain that is not Apple's", async () => {
    for (const environment of ["Sandbox", "Production", "Xcode"]) {
      const response = await post(
        JSON.stringify({ signedTransactions: [chain.signJws(transactionPayload({ environment }))] })
      );
      expect(response.status, environment).toBe(400);
    }
    expect(adminCalls).not.toHaveBeenCalled();
  });
});
