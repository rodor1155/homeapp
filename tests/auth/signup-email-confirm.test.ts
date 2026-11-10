import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

const redirect = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});

vi.mock("next/navigation", () => ({ redirect }));

const signUp = vi.fn();
const signInWithPassword = vi.fn();

vi.mock("@/lib/supabase-server", () => ({
  createClient: async () => ({
    auth: { signUp, signInWithPassword },
  }),
}));

vi.mock("@/lib/supabase-admin", () => ({
  createAdminClient: () => {
    throw new Error("createAdminClient must not run during public sign-up");
  },
}));

function authSource(): string {
  return readFileSync(
    fileURLToPath(new URL("../../app/actions/auth.ts", import.meta.url)),
    "utf8"
  );
}

function authPanelSource(): string {
  return readFileSync(
    fileURLToPath(new URL("../../components/AuthPanel.tsx", import.meta.url)),
    "utf8"
  );
}

afterEach(() => {
  signUp.mockReset();
  signInWithPassword.mockReset();
  redirect.mockClear();
  vi.resetModules();
});

describe("signUpWithPassword", () => {
  it("does not service-role confirm new users", () => {
    const source = authSource();
    expect(source).not.toMatch(/createAdminClient/);
    expect(source).not.toMatch(/email_confirm/);
  });

  it("asks the user to confirm email when Supabase returns no session", async () => {
    signUp.mockResolvedValue({
      data: {
        user: { id: "u1", identities: [{ id: "i1" }] },
        session: null,
      },
      error: null,
    });

    const { signUpWithPassword } = await import("@/app/actions/auth");
    const form = new FormData();
    form.set("email", "new@example.com");
    form.set("password", "long-enough");
    form.set("next", "/");

    const result = await signUpWithPassword(undefined, form);
    expect(result).toEqual({
      success:
        "Account created. Check your email for a confirmation link, then sign in.",
    });
    expect(signInWithPassword).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("redirects when Supabase returns a session (confirm email off)", async () => {
    signUp.mockResolvedValue({
      data: {
        user: { id: "u1", identities: [{ id: "i1" }] },
        session: { access_token: "t" },
      },
      error: null,
    });

    const { signUpWithPassword } = await import("@/app/actions/auth");
    const form = new FormData();
    form.set("email", "new@example.com");
    form.set("password", "long-enough");
    form.set("next", "/onboarding");

    await expect(signUpWithPassword(undefined, form)).rejects.toThrow(
      "REDIRECT:/onboarding"
    );
  });
});

describe("sign-up UI copy", () => {
  it("tells users to confirm via email before signing in", () => {
    const panel = authPanelSource().replace(/\s+/g, " ");
    expect(panel).toMatch(/confirmation link/i);
    expect(panel).toMatch(/confirm/i);
  });
});

describe("App Review demo account", () => {
  it("stays on the gated seed script, not the public sign-up action", () => {
    const seed = readFileSync(
      fileURLToPath(new URL("../../scripts/seed-review-demo.mjs", import.meta.url)),
      "utf8"
    );
    expect(seed).toMatch(/--confirm/);
    expect(seed).toMatch(/email_confirm:\s*true/);
    expect(authSource()).not.toMatch(/review-demo|REVIEW_DEMO/);
  });
});
