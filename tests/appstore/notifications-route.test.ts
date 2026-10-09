import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/* POST /api/appstore/notifications must answer 400 — never 5xx — to anything
   that is not a genuine, Apple-signed notification for this app. The database
   is mocked so a test can also prove that a rejected payload never reaches it. */

const adminCalls = vi.fn();
vi.mock("@/lib/supabase-admin", () => ({
  createAdminClient: () => {
    adminCalls();
    throw new Error("the database must not be touched by an unverified payload");
  },
}));

import { POST } from "@/app/api/appstore/notifications/route";
import {
  AppStoreVerificationError,
  verifyNotification,
  verifyTransaction,
} from "@/lib/appstore/verify";
import { DEFAULT_BUNDLE_ID, DEFAULT_PRODUCT_IDS } from "@/lib/appstore/config";
import {
  createFakeChain,
  notificationPayload,
  transactionPayload,
  unsignedJws,
  type FakeChain,
} from "./fixtures";

function post(body: string | undefined, contentType = "application/json") {
  return POST(
    new Request("https://homeapp.test/api/appstore/notifications", {
      method: "POST",
      headers: { "Content-Type": contentType },
      body,
    })
  );
}

const offlineConfig = {
  bundleId: DEFAULT_BUNDLE_ID,
  appAppleId: 6700000000,
  productIds: DEFAULT_PRODUCT_IDS,
  // No OCSP for a made-up chain.
  onlineChecks: false,
};

let chain: FakeChain;

beforeAll(() => {
  chain = createFakeChain();
});

beforeEach(() => {
  adminCalls.mockClear();
  vi.unstubAllEnvs();
});

describe("malformed requests", () => {
  const cases: Array<[string, string | undefined]> = [
    ["an empty body", undefined],
    ["a body that is not JSON", "not json at all"],
    ["truncated JSON", '{"signedPayload": "abc'],
    ["a JSON array", "[]"],
    ["a JSON string", '"signedPayload"'],
    ["JSON null", "null"],
    ["an object without signedPayload", "{}"],
    ["a null signedPayload", '{"signedPayload": null}'],
    ["a numeric signedPayload", '{"signedPayload": 12345}'],
    ["an object signedPayload", '{"signedPayload": {"notificationType": "DID_RENEW"}}'],
    ["an empty signedPayload", '{"signedPayload": ""}'],
    ["a signedPayload that is not a JWS", '{"signedPayload": "hello world"}'],
    ["a two-segment token", '{"signedPayload": "aaaa.bbbb"}'],
    ["three segments of garbage", '{"signedPayload": "aaaa.bbbb.cccc"}'],
    ["a JWS with a non-JSON header", JSON.stringify({ signedPayload: "bm90anNvbg.bm90anNvbg.c2ln" })],
    ["an oversized signedPayload", JSON.stringify({ signedPayload: "a".repeat(150_000) })],
    ["an oversized body", JSON.stringify({ signedPayload: "a.b.c", pad: "x".repeat(300_000) })],
  ];

  for (const [name, body] of cases) {
    it(`answers 400 to ${name}`, async () => {
      const response = await post(body);
      expect(response.status).toBe(400);
      expect(adminCalls).not.toHaveBeenCalled();
    });
  }

  it("answers 400 whatever the content type", async () => {
    const response = await post("signedPayload=abc", "application/x-www-form-urlencoded");
    expect(response.status).toBe(400);
  });
});

describe("fake and unsigned notifications", () => {
  it("answers 400 to an unsigned (alg: none) notification", async () => {
    const response = await post(
      JSON.stringify({ signedPayload: unsignedJws(notificationPayload(chain)) })
    );
    expect(response.status).toBe(400);
    expect(adminCalls).not.toHaveBeenCalled();
  });

  it("answers 400 to a JWS with a header but no certificate chain", async () => {
    const header = Buffer.from(JSON.stringify({ alg: "ES256" })).toString("base64url");
    const body = Buffer.from(JSON.stringify(notificationPayload(chain))).toString("base64url");
    const response = await post(JSON.stringify({ signedPayload: `${header}.${body}.c2lnbmF0dXJl` }));
    expect(response.status).toBe(400);
    expect(adminCalls).not.toHaveBeenCalled();
  });

  it("answers 400 to a JWS whose x5c entries are not certificates", async () => {
    const header = Buffer.from(
      JSON.stringify({ alg: "ES256", x5c: ["AAAA", "BBBB", "CCCC"] })
    ).toString("base64url");
    const body = Buffer.from(JSON.stringify(notificationPayload(chain))).toString("base64url");
    const response = await post(JSON.stringify({ signedPayload: `${header}.${body}.c2lnbmF0dXJl` }));
    expect(response.status).toBe(400);
  });

  it("answers 400 to a well-formed notification signed by a chain that is not Apple's", async () => {
    const signedPayload = chain.signJws(notificationPayload(chain));
    const response = await post(JSON.stringify({ signedPayload }));
    expect(response.status).toBe(400);
    expect(adminCalls).not.toHaveBeenCalled();
  });

  it("answers 400 to the same forgery when Production is configured too", async () => {
    vi.stubEnv("APPSTORE_APP_APPLE_ID", "6700000000");
    for (const environment of ["Production", "Sandbox"]) {
      const signedPayload = chain.signJws(
        notificationPayload(chain, {}, { environment, appAppleId: 6700000000 })
      );
      const response = await post(JSON.stringify({ signedPayload }));
      expect(response.status).toBe(400);
    }
    expect(adminCalls).not.toHaveBeenCalled();
  });

  it("answers 400 to a forgery claiming the Xcode or LocalTesting environment", async () => {
    for (const environment of ["Xcode", "LocalTesting"]) {
      const signedPayload = chain.signJws(notificationPayload(chain, {}, { environment }));
      const response = await post(JSON.stringify({ signedPayload }));
      expect(response.status).toBe(400);
    }
    expect(adminCalls).not.toHaveBeenCalled();
  });

  it("never answers 5xx across a spread of hostile inputs", async () => {
    const hostile = [
      "{", "\u0000", "🙂", '{"signedPayload":"..."}', '{"signedPayload":".."}',
      '{"signedPayload":"e30.e30.e30"}', '{"signedPayload":"eyJhbGciOiJFUzI1NiJ9.e30."}',
      JSON.stringify({ signedPayload: ["a.b.c"] }),
      JSON.stringify({ signedPayload: "a.b.c", data: { signedTransactionInfo: "x" } }),
    ];
    for (const body of hostile) {
      const response = await post(body);
      expect(response.status, body).toBe(400);
    }
  });
});

describe("the verifier itself", () => {
  // These show the 400s above are about the trust anchor, not a broken fixture:
  // the very same signed data verifies once the test root is trusted.
  it("accepts the look-alike chain only when its root is trusted", async () => {
    const signedPayload = chain.signJws(notificationPayload(chain));

    await expect(verifyNotification(signedPayload)).rejects.toBeInstanceOf(
      AppStoreVerificationError
    );

    const trusted = await verifyNotification(signedPayload, {
      roots: [chain.rootDer],
      config: offlineConfig,
    });
    expect(trusted.environment).toBe("Sandbox");
    expect(trusted.payload.notificationType).toBe("DID_RENEW");
  });

  it("accepts both Sandbox and Production data", async () => {
    const options = { roots: [chain.rootDer], config: offlineConfig };

    const sandbox = await verifyTransaction(
      chain.signJws(transactionPayload({ environment: "Sandbox" })),
      options
    );
    expect(sandbox.environment).toBe("Sandbox");

    const production = await verifyTransaction(
      chain.signJws(transactionPayload({ environment: "Production" })),
      options
    );
    expect(production.environment).toBe("Production");

    const notification = await verifyNotification(
      chain.signJws(
        notificationPayload(chain, {}, { environment: "Production", appAppleId: 6700000000 })
      ),
      options
    );
    expect(notification.environment).toBe("Production");
  });

  it("rejects Production data until the app's Apple ID is configured", async () => {
    const options = {
      roots: [chain.rootDer],
      config: { ...offlineConfig, appAppleId: null },
    };
    await expect(
      verifyTransaction(chain.signJws(transactionPayload({ environment: "Production" })), options)
    ).rejects.toBeInstanceOf(AppStoreVerificationError);
  });

  it("rejects another app's bundle id, a tampered payload and other environments", async () => {
    const options = { roots: [chain.rootDer], config: offlineConfig };

    await expect(
      verifyTransaction(chain.signJws(transactionPayload({ bundleId: "com.example.other" })), options)
    ).rejects.toBeInstanceOf(AppStoreVerificationError);

    await expect(
      verifyNotification(
        chain.signJws(notificationPayload(chain, {}, { appAppleId: 1, environment: "Production" })),
        options
      )
    ).rejects.toBeInstanceOf(AppStoreVerificationError);

    for (const environment of ["Xcode", "LocalTesting"]) {
      await expect(
        verifyTransaction(chain.signJws(transactionPayload({ environment })), options)
      ).rejects.toBeInstanceOf(AppStoreVerificationError);
    }

    const [header, , signature] = chain.signJws(transactionPayload()).split(".");
    const swapped = Buffer.from(
      JSON.stringify(transactionPayload({ expiresDate: Date.now() + 10 * 365 * 24 * 3600 * 1000 }))
    ).toString("base64url");
    await expect(
      verifyTransaction(`${header}.${swapped}.${signature}`, options)
    ).rejects.toBeInstanceOf(AppStoreVerificationError);
  });
});
