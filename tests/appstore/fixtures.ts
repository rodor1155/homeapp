import { execFileSync } from "node:child_process";
import { createPrivateKey, sign } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/* A look-alike App Store signing chain, made with openssl at test time: a root
   CA, an intermediate carrying Apple's intermediate OID, and a leaf carrying
   Apple's App Store receipt-signing OID. Everything about it is well formed —
   the one thing it is not is rooted in Apple Root CA - G3. That makes it the
   strongest forgery an attacker could build, and lets the tests prove the
   endpoint turns it away while the same data passes once its root is trusted. */

export type FakeChain = {
  /** DER of the fake root — pass as `roots` to trust this chain in a test. */
  rootDer: Buffer;
  /** Signs a payload as a compact JWS with the chain in `x5c`. */
  signJws: (payload: Record<string, unknown>) => string;
};

const LEAF_OID = "1.2.840.113635.100.6.11.1";
const INTERMEDIATE_OID = "1.2.840.113635.100.6.2.1";

function openssl(cwd: string, args: string[]): void {
  execFileSync("openssl", args, { cwd, stdio: "pipe" });
}

function pemToDer(pem: string): Buffer {
  return Buffer.from(
    pem.replace(/-----(BEGIN|END) CERTIFICATE-----/g, "").replace(/\s+/g, ""),
    "base64"
  );
}

export function createFakeChain(): FakeChain {
  const dir = mkdtempSync(join(tmpdir(), "hearth-appstore-test-"));
  const ec = ["-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1", "-nodes"];

  writeFileSync(
    join(dir, "root.cnf"),
    "[req]\ndistinguished_name=dn\nx509_extensions=ext\nprompt=no\n[dn]\nCN=Test Root CA\n[ext]\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\n"
  );
  writeFileSync(
    join(dir, "int.ext"),
    `basicConstraints=critical,CA:TRUE,pathlen:0\nkeyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid\n${INTERMEDIATE_OID}=DER:0500\n`
  );
  writeFileSync(
    join(dir, "leaf.ext"),
    `basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid\n${LEAF_OID}=DER:0500\n`
  );

  openssl(dir, [
    "req", "-x509", ...ec, "-keyout", "root.key", "-out", "root.pem",
    "-days", "30", "-sha256", "-config", "root.cnf",
  ]);
  openssl(dir, [
    "req", "-new", ...ec, "-keyout", "int.key", "-out", "int.csr",
    "-subj", "/CN=Test Worldwide Developer Relations",
  ]);
  openssl(dir, [
    "x509", "-req", "-in", "int.csr", "-CA", "root.pem", "-CAkey", "root.key",
    "-CAcreateserial", "-out", "int.pem", "-days", "30", "-sha256", "-extfile", "int.ext",
  ]);
  openssl(dir, [
    "req", "-new", ...ec, "-keyout", "leaf.key", "-out", "leaf.csr",
    "-subj", "/CN=Test Prod ECC Mac App Store and iTunes Store Receipt Signing",
  ]);
  openssl(dir, [
    "x509", "-req", "-in", "leaf.csr", "-CA", "int.pem", "-CAkey", "int.key",
    "-CAcreateserial", "-out", "leaf.pem", "-days", "30", "-sha256", "-extfile", "leaf.ext",
  ]);

  const read = (name: string) => readFileSync(join(dir, name), "utf8");
  const rootDer = pemToDer(read("root.pem"));
  const x5c = [read("leaf.pem"), read("int.pem"), read("root.pem")].map((pem) =>
    pemToDer(pem).toString("base64")
  );
  const leafKey = createPrivateKey(read("leaf.key"));

  return {
    rootDer,
    signJws(payload) {
      const header = Buffer.from(JSON.stringify({ alg: "ES256", x5c })).toString("base64url");
      const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
      const signature = sign("sha256", Buffer.from(`${header}.${body}`), {
        key: leafKey,
        dsaEncoding: "ieee-p1363",
      }).toString("base64url");
      return `${header}.${body}.${signature}`;
    },
  };
}

export const BUNDLE_ID = "co.rodor.homeapp";
export const MONTHLY = "co.rodor.homeapp.household.monthly";
export const HOUSEHOLD_ID = "0b5c1a52-7d7e-4a52-9c3e-6b1f2f0c9a11";

export function transactionPayload(overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    transactionId: "2000000000000001",
    originalTransactionId: "2000000000000001",
    bundleId: BUNDLE_ID,
    productId: MONTHLY,
    type: "Auto-Renewable Subscription",
    purchaseDate: now - 60_000,
    originalPurchaseDate: now - 60_000,
    expiresDate: now + 30 * 24 * 3600 * 1000,
    quantity: 1,
    inAppOwnershipType: "PURCHASED",
    signedDate: now,
    environment: "Sandbox",
    appAccountToken: HOUSEHOLD_ID,
    ...overrides,
  };
}

export function notificationPayload(
  chain: FakeChain,
  overrides: Record<string, unknown> = {},
  dataOverrides: Record<string, unknown> = {}
) {
  return {
    notificationType: "DID_RENEW",
    notificationUUID: "7f0f7a0e-6a39-4a5b-9a55-2f3f1f0e4b10",
    version: "2.0",
    signedDate: Date.now(),
    data: {
      environment: "Sandbox",
      bundleId: BUNDLE_ID,
      bundleVersion: "29",
      signedTransactionInfo: chain.signJws(transactionPayload()),
      ...dataOverrides,
    },
    ...overrides,
  };
}

/** An unsigned token: `alg: none`, empty signature. */
export function unsignedJws(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.`;
}
