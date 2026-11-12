import { describe, expect, it } from "vitest";
import {
  cookieAttributes,
  cookieSecretsFromEnv,
  readCookie,
  signVisitorCookie,
  slideCookie,
  visitorCookieName,
  verifyVisitorCookie,
  COOKIE_TTL_SEC,
  type VisitorClaims,
} from "@/lib/share/cookie";

const SECRET_A = "A".repeat(43) + "a-secret-a-for-tests-only=";
const SECRET_B = "B".repeat(43) + "a-secret-b-for-tests-only=";
const LINK_A = "1c000000-0000-4000-8000-0000000000a1";
const LINK_B = "9f3a1c20-5d7e-4000-8000-0000000000b1";
const NOW = 1_800_000_000;

function claims(over: Partial<VisitorClaims> = {}): VisitorClaims {
  return { lid: LINK_A, vid: "7e000000-0000-4000-8000-0000000000a1", ep: 0, pw: true, exp: NOW + COOKIE_TTL_SEC, ...over };
}

function flipByte(b64url: string, index: number): string {
  const bytes = Buffer.from(b64url, "base64url");
  bytes[index % bytes.length] ^= 0x01;
  return bytes.toString("base64url");
}

describe("signVisitorCookie / verifyVisitorCookie", () => {
  it("round-trips the claims", () => {
    const c = claims({ ep: 3, pw: false });
    const value = signVisitorCookie(c, SECRET_A);
    expect(value).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/);
    expect(verifyVisitorCookie(value, [SECRET_A], NOW)).toEqual(c);
  });

  it("is deterministic for the same claims and secret, and differs per secret and per claim", () => {
    const c = claims();
    expect(signVisitorCookie(c, SECRET_A)).toBe(signVisitorCookie(c, SECRET_A));
    expect(signVisitorCookie(c, SECRET_A)).not.toBe(signVisitorCookie(c, SECRET_B));
    expect(signVisitorCookie(c, SECRET_A)).not.toBe(signVisitorCookie({ ...c, ep: 1 }, SECRET_A));
  });

  it("does not put the secret or anything beyond the four claims in the value", () => {
    const value = signVisitorCookie(claims(), SECRET_A);
    expect(value).not.toContain(SECRET_A);
    const payload = JSON.parse(Buffer.from(value.split(".")[1], "base64url").toString("utf8"));
    expect(Object.keys(payload).sort()).toEqual(["ep", "exp", "lid", "pw", "vid"]);
  });

  describe("tampering", () => {
    const value = signVisitorCookie(claims(), SECRET_A);
    const [v, payload, mac] = value.split(".");

    it("rejects a flipped bit in the signature (every byte position)", () => {
      const macLen = Buffer.from(mac, "base64url").length;
      for (let i = 0; i < macLen; i++) {
        expect(verifyVisitorCookie(`${v}.${payload}.${flipByte(mac, i)}`, [SECRET_A], NOW)).toBeNull();
      }
    });

    it("rejects a flipped bit in the payload (every byte position)", () => {
      const len = Buffer.from(payload, "base64url").length;
      for (let i = 0; i < len; i++) {
        expect(verifyVisitorCookie(`${v}.${flipByte(payload, i)}.${mac}`, [SECRET_A], NOW)).toBeNull();
      }
    });

    it("rejects a payload swapped for another valid payload under the old signature (privilege change)", () => {
      const forged = Buffer.from(JSON.stringify({ ...claims({ lid: LINK_B }) })).toString("base64url");
      expect(verifyVisitorCookie(`${v}.${forged}.${mac}`, [SECRET_A], NOW)).toBeNull();
      const bumped = Buffer.from(JSON.stringify(claims({ exp: NOW + 10 * COOKIE_TTL_SEC }))).toString("base64url");
      expect(verifyVisitorCookie(`${v}.${bumped}.${mac}`, [SECRET_A], NOW)).toBeNull();
    });

    it("rejects non-canonical base64url (the same bytes spelled another way)", () => {
      // The last character of a 43-char base64url string carries 2 unused bits: a lenient decoder accepts 4 spellings.
      const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
      const last = mac[mac.length - 1];
      let accepted = 0;
      for (const ch of alphabet) {
        if (ch === last) continue;
        const variant = mac.slice(0, -1) + ch;
        if (Buffer.from(variant, "base64url").equals(Buffer.from(mac, "base64url"))) {
          accepted++;
          expect(verifyVisitorCookie(`${v}.${payload}.${variant}`, [SECRET_A], NOW)).toBeNull();
        }
      }
      expect(accepted).toBeGreaterThan(0); // the test exercises real alternative spellings
      // Padding and stray characters are not accepted either.
      expect(verifyVisitorCookie(`${v}.${payload}.${mac}=`, [SECRET_A], NOW)).toBeNull();
      expect(verifyVisitorCookie(`${v}.${payload}.${mac}\n`, [SECRET_A], NOW)).toBeNull();
      expect(verifyVisitorCookie(`${v}.${payload}=.${mac}`, [SECRET_A], NOW)).toBeNull();
    });

    it("rejects truncated values at every length", () => {
      for (let n = 0; n < value.length; n++) {
        expect(verifyVisitorCookie(value.slice(0, n), [SECRET_A], NOW)).toBeNull();
      }
    });

    it("rejects extra segments, a wrong version, and empty parts", () => {
      expect(verifyVisitorCookie(`${value}.x`, [SECRET_A], NOW)).toBeNull();
      expect(verifyVisitorCookie(`v2.${payload}.${mac}`, [SECRET_A], NOW)).toBeNull();
      expect(verifyVisitorCookie(`.${payload}.${mac}`, [SECRET_A], NOW)).toBeNull();
      expect(verifyVisitorCookie(`${v}..${mac}`, [SECRET_A], NOW)).toBeNull();
      expect(verifyVisitorCookie(`${v}.${payload}.`, [SECRET_A], NOW)).toBeNull();
      expect(verifyVisitorCookie("", [SECRET_A], NOW)).toBeNull();
      expect(verifyVisitorCookie("...", [SECRET_A], NOW)).toBeNull();
    });

    it("rejects oversized values without parsing them", () => {
      expect(verifyVisitorCookie("v1." + "A".repeat(100_000) + "." + mac, [SECRET_A], NOW)).toBeNull();
    });

    it("rejects non-strings and an empty secret list", () => {
      expect(verifyVisitorCookie(undefined as unknown as string, [SECRET_A], NOW)).toBeNull();
      expect(verifyVisitorCookie(null as unknown as string, [SECRET_A], NOW)).toBeNull();
      expect(verifyVisitorCookie(value, [], NOW)).toBeNull();
      expect(verifyVisitorCookie(value, [""], NOW)).toBeNull();
    });

    it("rejects a validly signed value whose claims have the wrong shape", () => {
      const bad: unknown[] = [
        { ...claims(), lid: 5 },
        { ...claims(), vid: "" },
        { ...claims(), ep: -1 },
        { ...claims(), ep: 1.5 },
        { ...claims(), pw: "yes" },
        { ...claims(), exp: "soon" },
        { ...claims(), exp: Number.NaN },
        { lid: LINK_A },
        [],
        "x",
        null,
      ];
      for (const b of bad) {
        const p = Buffer.from(JSON.stringify(b)).toString("base64url");
        const forged = signRaw(`${"v1"}.${p}`, SECRET_A);
        expect(verifyVisitorCookie(forged, [SECRET_A], NOW)).toBeNull();
      }
    });
  });

  describe("secrets and rotation", () => {
    it("fails with the wrong secret", () => {
      const value = signVisitorCookie(claims(), SECRET_A);
      expect(verifyVisitorCookie(value, [SECRET_B], NOW)).toBeNull();
    });

    it("verifies with the previous secret during rotation, and signs with the first", () => {
      const old = signVisitorCookie(claims(), SECRET_A);
      expect(verifyVisitorCookie(old, [SECRET_B, SECRET_A], NOW)).toEqual(claims());
      const fresh = signVisitorCookie(claims(), SECRET_B);
      expect(verifyVisitorCookie(fresh, [SECRET_B, SECRET_A], NOW)).toEqual(claims());
      // Once the old secret is dropped, old cookies stop working.
      expect(verifyVisitorCookie(old, [SECRET_B], NOW)).toBeNull();
    });

    it("refuses to sign with an empty or short secret", () => {
      expect(() => signVisitorCookie(claims(), "")).toThrow();
      expect(() => signVisitorCookie(claims(), "short")).toThrow();
    });

    it("reads a comma-separated SHARE_COOKIE_SECRET, newest first, ignoring blanks and short entries", () => {
      expect(cookieSecretsFromEnv({ SHARE_COOKIE_SECRET: `${SECRET_B}, ${SECRET_A} ,,short` })).toEqual([SECRET_B, SECRET_A]);
      expect(cookieSecretsFromEnv({ SHARE_COOKIE_SECRET: SECRET_A })).toEqual([SECRET_A]);
      expect(cookieSecretsFromEnv({})).toEqual([]);
      expect(cookieSecretsFromEnv({ SHARE_COOKIE_SECRET: "  " })).toEqual([]);
    });

    it("never echoes a secret in an error message", () => {
      let message = "";
      try {
        signVisitorCookie(claims(), "tiny-secret");
      } catch (e) {
        message = String((e as Error).message);
      }
      expect(message).not.toContain("tiny-secret");
    });
  });

  describe("expiry and link binding", () => {
    it("expires: valid before exp, invalid at and after exp", () => {
      const c = claims({ exp: NOW + 100 });
      const value = signVisitorCookie(c, SECRET_A);
      expect(verifyVisitorCookie(value, [SECRET_A], NOW + 99)).toEqual(c);
      expect(verifyVisitorCookie(value, [SECRET_A], NOW + 100)).toBeNull();
      expect(verifyVisitorCookie(value, [SECRET_A], NOW + 100_000)).toBeNull();
    });

    it("an already-expired cookie signs but never verifies", () => {
      const value = signVisitorCookie(claims({ exp: NOW - 1 }), SECRET_A);
      expect(verifyVisitorCookie(value, [SECRET_A], NOW)).toBeNull();
    });

    it("binds to a link: a cookie of link A is refused when link B is expected", () => {
      const value = signVisitorCookie(claims({ lid: LINK_A }), SECRET_A);
      expect(verifyVisitorCookie(value, [SECRET_A], NOW, LINK_A)?.lid).toBe(LINK_A);
      expect(verifyVisitorCookie(value, [SECRET_A], NOW, LINK_B)).toBeNull();
      expect(verifyVisitorCookie(value, [SECRET_A], NOW, "")).toBeNull();
    });
  });
});

describe("slideCookie (sliding 12 h expiry)", () => {
  const issuedAt = NOW;
  const c = claims({ exp: issuedAt + COOKIE_TTL_SEC });

  it("has a 12 h default lifetime", () => {
    expect(COOKIE_TTL_SEC).toBe(43_200);
  });

  it("does not reissue at 1 h of age, and the value is the same cookie", () => {
    const r = slideCookie(c, issuedAt + 3600, COOKIE_TTL_SEC, SECRET_A);
    expect(r.refreshed).toBe(false);
    expect(r.value).toBe(signVisitorCookie(c, SECRET_A));
  });

  it("reissues at 2 h of age, extending to 12 h from now", () => {
    const now = issuedAt + 7200;
    const r = slideCookie(c, now, COOKIE_TTL_SEC, SECRET_A);
    expect(r.refreshed).toBe(true);
    const next = verifyVisitorCookie(r.value, [SECRET_A], now);
    expect(next).toEqual({ ...c, exp: now + COOKIE_TTL_SEC });
  });

  it("reissues just past the threshold and not at it (strictly less than 11 h of life left)", () => {
    expect(slideCookie(c, issuedAt + 3600, COOKIE_TTL_SEC, SECRET_A).refreshed).toBe(false);
    expect(slideCookie(c, issuedAt + 3601, COOKIE_TTL_SEC, SECRET_A).refreshed).toBe(true);
  });

  it("keeps the other claims (link, visitor, epoch, password flag)", () => {
    const r = slideCookie(claims({ ep: 7, pw: false, exp: issuedAt + 100 }), issuedAt, COOKIE_TTL_SEC, SECRET_A);
    expect(r.refreshed).toBe(true);
    const next = verifyVisitorCookie(r.value, [SECRET_A], issuedAt);
    expect(next).toMatchObject({ lid: LINK_A, ep: 7, pw: false, exp: issuedAt + COOKIE_TTL_SEC });
  });

  it("falls back to the first secret of SHARE_COOKIE_SECRET when none is passed", () => {
    const prev = process.env.SHARE_COOKIE_SECRET;
    process.env.SHARE_COOKIE_SECRET = `${SECRET_B},${SECRET_A}`;
    try {
      const r = slideCookie(claims({ exp: NOW + 5 }), NOW);
      expect(r.refreshed).toBe(true);
      expect(verifyVisitorCookie(r.value, [SECRET_B], NOW)).not.toBeNull();
      expect(verifyVisitorCookie(r.value, [SECRET_A], NOW)).toBeNull();
    } finally {
      if (prev === undefined) delete process.env.SHARE_COOKIE_SECRET;
      else process.env.SHARE_COOKIE_SECRET = prev;
    }
  });
});

describe("visitorCookieName", () => {
  it("is scoped to one link, and short", () => {
    expect(visitorCookieName(LINK_A)).toBe("atl_v_1c000000-000");
    expect(visitorCookieName(LINK_A)).not.toBe(visitorCookieName(LINK_B));
    expect(visitorCookieName(LINK_A).length).toBeLessThanOrEqual(30);
  });

  it("only ever contains cookie-name characters, whatever it is given", () => {
    expect(visitorCookieName("a b;c=d\r\n,é")).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(visitorCookieName("")).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("cookieAttributes", () => {
  it("is HttpOnly, Lax, path-wide, with a Max-Age", () => {
    const a = cookieAttributes(false, 43200);
    expect(a).toContain("HttpOnly");
    expect(a).toContain("SameSite=Lax");
    expect(a).toContain("Path=/");
    expect(a).toContain("Max-Age=43200");
    expect(a).not.toContain("Secure");
  });

  it("adds Secure in production", () => {
    const a = cookieAttributes(true, 43200);
    expect(a).toContain("HttpOnly");
    expect(a).toContain("Secure");
    expect(a).toContain("SameSite=Lax");
  });

  it("clamps Max-Age to a non-negative integer (0 clears the cookie)", () => {
    expect(cookieAttributes(true, 0)).toContain("Max-Age=0");
    expect(cookieAttributes(true, -5)).toContain("Max-Age=0");
    expect(cookieAttributes(true, 10.9)).toContain("Max-Age=10");
    expect(cookieAttributes(true, Number.NaN)).toContain("Max-Age=0");
  });
});

describe("readCookie", () => {
  it("finds a cookie by name in a Cookie header", () => {
    expect(readCookie("a=1; atl_v_x=abc.def; b=2", "atl_v_x")).toBe("abc.def");
    expect(readCookie("atl_v_x=abc", "atl_v_x")).toBe("abc");
    expect(readCookie("xatl_v_x=abc", "atl_v_x")).toBeNull();
    expect(readCookie("a=1", "atl_v_x")).toBeNull();
    expect(readCookie(null, "atl_v_x")).toBeNull();
    expect(readCookie("", "atl_v_x")).toBeNull();
  });
});

// Sign an arbitrary string with the cookie MAC to build a validly signed value with hostile contents.
import { createHmac } from "node:crypto";
function signRaw(signingInput: string, secret: string): string {
  return `${signingInput}.${createHmac("sha256", secret).update(signingInput).digest("base64url")}`;
}
