import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/* Static checks on user-facing privacy copy. They read the source files as
 * text, so they need no database, network or rendering. */

function source(path: string): string {
  return readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), "utf8")
    // JSX wraps long copy over several lines; compare it as running text.
    .replace(/\s+/g, " ")
    .replace(/&apos;/g, "'");
}

describe("Add to the house sheet copy", () => {
  const sheet = source("components/AddToHouseSheet.tsx");

  it("no longer claims nothing is uploaded to Hearth's servers", () => {
    expect(sheet).not.toMatch(/nothing is uploaded/i);
  });

  it("says the MOT lookup sends the registration via Hearth's server to the DVSA", () => {
    expect(sheet).toContain(
      "an MOT lookup sends the registration, via Hearth's server, to the DVSA."
    );
    expect(sheet).toContain("Look up sends the registration, via Hearth's server, to the DVSA.");
  });
});

describe("privacy policy third parties", () => {
  const page = source("app/privacy/page.tsx");

  it("names DVSA and what it receives", () => {
    expect(page).toContain("<strong>DVSA (MOT History API)</strong> — receives the vehicle registration");
  });

  it("names Ideal Postcodes and what it receives", () => {
    expect(page).toContain("<strong>Ideal Postcodes</strong> — receives the postcode");
  });

  it("names postcodes.io, which the home map and address fallback call", () => {
    expect(page).toContain("<strong>postcodes.io</strong> — receives your home's postcode");
  });
});

describe("no false on-device claims for the server lookups", () => {
  const files = [
    "components/AddToHouseSheet.tsx",
    "app/privacy/page.tsx",
    "app/account-deletion/page.tsx",
    "lib/hearth-vault-renewals.ts",
  ];

  it.each(files)("%s makes no blanket 'nothing leaves the device' claim", (file) => {
    const text = source(file);
    expect(text).not.toMatch(/nothing (ever )?leaves (your|this) (device|phone|iphone)/i);
    expect(text).not.toMatch(/nothing is uploaded/i);
  });
});

describe("postal address", () => {
  const page = source("app/privacy/page.tsx");

  it("shows the postal/contact address on the privacy page", () => {
    expect(page).toContain("Postal and contact address: Suite 861, 80A Ruskin Ave, Welling DA16 3QQ.");
  });

  it("does not call it a registered office or add 'Ltd'", () => {
    expect(page).not.toMatch(/registered office/i);
    expect(page).not.toMatch(/\bLtd\b|\bLimited\b/);
  });

  it("has no previous home address anywhere in the legal pages", () => {
    for (const file of [
      "app/privacy/page.tsx",
      "app/account-deletion/page.tsx",
      "app/account-deleted/page.tsx",
    ]) {
      expect(source(file)).not.toMatch(/craddocks|KT21|ashtead/i);
    }
  });
});
