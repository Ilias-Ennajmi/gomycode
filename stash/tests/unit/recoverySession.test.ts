import { describe, expect, it, vi } from "vitest";
import { RecoveryFailure, adoptCreatedCode } from "@/lib/recovery";

const CODE = "4F7QK-2M9XA-0TB3R-H8ZNC";
const ANSWER = { code: CODE, created_at: "2026-11-10T12:00:00.000Z", access_token: "at", refresh_token: "rt", expires_at: 123 };

/*
 * Making a recovery code gives the identity a password, and that ends the session this phone
 * had. The function answers with a fresh session next to the code; the phone must take it
 * before it shows the code, or it would be signed out of its own saves.
 */
describe("making a recovery code keeps this phone signed in", () => {
  it("puts the new session in place and then hands back the code", async () => {
    const setSession = vi.fn().mockResolvedValue({ data: { session: { user: { id: "u1" } } }, error: null });
    const made = await adoptCreatedCode(ANSWER, setSession);
    expect(setSession).toHaveBeenCalledExactlyOnceWith({ access_token: "at", refresh_token: "rt" });
    expect(made).toEqual({ code: CODE, createdAt: "2026-11-10T12:00:00.000Z", signedIn: true });
  });

  it("still hands back the code when the session cannot be set, and says so", async () => {
    const refused = vi.fn().mockResolvedValue({ data: { session: null }, error: new Error("bad jwt") });
    expect((await adoptCreatedCode(ANSWER, refused)).signedIn).toBe(false);
    const thrown = vi.fn().mockRejectedValue(new Error("offline"));
    const made = await adoptCreatedCode(ANSWER, thrown);
    expect(made.code).toBe(CODE);
    expect(made.signedIn).toBe(false);
  });

  it("treats an answer without a session (the server could not sign in) as signed out, never as an error", async () => {
    const setSession = vi.fn();
    const made = await adoptCreatedCode({ code: CODE, created_at: ANSWER.created_at, access_token: null, refresh_token: null }, setSession);
    expect(setSession).not.toHaveBeenCalled();
    expect(made).toMatchObject({ code: CODE, signedIn: false });
  });

  it("refuses an answer without a usable code before touching the session", async () => {
    const setSession = vi.fn();
    await expect(adoptCreatedCode({ access_token: "at", refresh_token: "rt" }, setSession)).rejects.toBeInstanceOf(RecoveryFailure);
    await expect(adoptCreatedCode({ ...ANSWER, code: "nope" }, setSession)).rejects.toBeInstanceOf(RecoveryFailure);
    await expect(adoptCreatedCode(null, setSession)).rejects.toBeInstanceOf(RecoveryFailure);
    expect(setSession).not.toHaveBeenCalled();
  });
});
