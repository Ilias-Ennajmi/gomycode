import { describe, expect, it, vi } from "vitest";
import { checkSecondFactor, needsSecondFactor } from "@/lib/server/mfa";

describe("needsSecondFactor", () => {
  const cases: Array<[string | null, string | null, boolean]> = [
    ["aal1", "aal2", true], // enrolled, signed in with the password only
    ["aal2", "aal2", false], // enrolled and already verified
    ["aal1", "aal1", false], // not enrolled
    [null, null, false], // no session
    [null, "aal2", true], // a factor exists but nothing is verified yet
    ["aal2", "aal1", false],
    ["aal1", null, false],
    ["aal2", null, false],
    ["aal3", "aal2", true], // unknown levels never count as aal2
  ];
  it.each(cases)("currentLevel=%s nextLevel=%s -> %s", (currentLevel, nextLevel, expected) => {
    expect(needsSecondFactor({ currentLevel, nextLevel })).toBe(expected);
  });
});

describe("checkSecondFactor", () => {
  type Result = { data: { currentLevel: string | null; nextLevel: string | null } | null; error: unknown };
  const clientWith = (result: Result) => ({
    auth: { mfa: { getAuthenticatorAssuranceLevel: vi.fn(async () => result) } },
  });

  it("is 'needed' when the owner must still enter a code", async () => {
    const c = clientWith({ data: { currentLevel: "aal1", nextLevel: "aal2" }, error: null });
    await expect(checkSecondFactor(c)).resolves.toBe("needed");
  });

  it("is 'ok' when nothing is pending", async () => {
    await expect(
      checkSecondFactor(clientWith({ data: { currentLevel: "aal2", nextLevel: "aal2" }, error: null })),
    ).resolves.toBe("ok");
    await expect(
      checkSecondFactor(clientWith({ data: { currentLevel: "aal1", nextLevel: "aal1" }, error: null })),
    ).resolves.toBe("ok");
  });

  it("is 'error' (so callers fail closed) when Supabase reports an error or no data", async () => {
    await expect(checkSecondFactor(clientWith({ data: null, error: { message: "x" } }))).resolves.toBe("error");
    await expect(checkSecondFactor(clientWith({ data: null, error: null }))).resolves.toBe("error");
  });

  it("is 'error' when the call throws", async () => {
    const c = {
      auth: {
        mfa: {
          getAuthenticatorAssuranceLevel: vi.fn(async (): Promise<Result> => {
            throw new Error("boom");
          }),
        },
      },
    };
    await expect(checkSecondFactor(c)).resolves.toBe("error");
  });
});
