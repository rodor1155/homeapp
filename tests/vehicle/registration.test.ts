import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { INVALID_REGISTRATION_MESSAGE, normaliseRegistration } from "@/lib/registration";
import { lookupMot, normaliseRegistration as motNormalise } from "@/lib/mot";

describe("normaliseRegistration", () => {
  it.each([
    ["ab-12 cde", "AB12CDE"],
    ["FG11 VXY", "FG11VXY"],
    ["fg11vxy", "FG11VXY"],
    ["  fx74   ygf  ", "FX74YGF"],
    ["A-1", "A1"],
    ["\tab\n12-", "AB12"],
    ["ABCD1234", "ABCD1234"],
  ])("normalises %j to %j", (raw, expected) => {
    expect(normaliseRegistration(raw)).toBe(expected);
  });

  it.each(["..", "AB/12", "", "   ", "-", "A", "ABCDE12345", "AB12_CD", "ÀB12", "AB.12", "AB12%2F"])(
    "rejects %j",
    (raw) => {
      expect(normaliseRegistration(raw)).toBeNull();
    }
  );

  it("is idempotent", () => {
    const once = normaliseRegistration("ab-12 cde")!;
    expect(normaliseRegistration(once)).toBe(once);
  });

  it("is the same function lib/mot.ts uses", () => {
    expect(motNormalise).toBe(normaliseRegistration);
  });
});

describe("lookupMot", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("refuses an invalid registration without any network call", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubEnv("DVSA_MOT_API_KEY", "test-key");
    await expect(lookupMot("..")).rejects.toThrow(/invalid registration/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("AddToHouseSheet", () => {
  // No DOM in this suite — check the sheet validates with the shared rule and
  // wording before it fetches, rather than rendering it.
  const source = readFileSync(
    fileURLToPath(new URL("../../components/AddToHouseSheet.tsx", import.meta.url)),
    "utf8"
  );
  const lookup = source.slice(source.indexOf("async function lookupRegistration"));

  it("uses the shared normaliser and message", () => {
    expect(source).toMatch(/from "@\/lib\/registration"/);
    expect(source).not.toMatch(/from "@\/lib\/mot"/);
    expect(INVALID_REGISTRATION_MESSAGE.length).toBeGreaterThan(0);
  });

  it("validates before sending the request, and sends the normalised value", () => {
    const validate = lookup.indexOf("normaliseRegistration(regInput)");
    const notice = lookup.indexOf("setMotNotice(INVALID_REGISTRATION_MESSAGE)");
    const fetchCall = lookup.indexOf('fetch("/api/vehicle/mot"');
    expect(validate).toBeGreaterThan(-1);
    expect(notice).toBeGreaterThan(validate);
    expect(fetchCall).toBeGreaterThan(notice);
    expect(lookup).toContain("JSON.stringify({ registration })");
  });
});
