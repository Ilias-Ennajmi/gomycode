import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { presignAssetUploads, presignPut, presignUrl, r2Config } from "@/lib/server/r2";
import { assetKey, isAssetId, newAssetId } from "@/lib/assets/asset-id";

/**
 * An independent SigV4 query-string signer, written step by step from the AWS documentation
 * (docs.aws.amazon.com/AmazonS3/latest/API/sigv4-query-string-auth.html), used as the oracle for presignPut.
 */
function referenceSign(opts: {
  method: string;
  host: string;
  uri: string; // already URI-encoded
  accessKey: string;
  secret: string;
  region: string;
  amzDate: string; // 20250102T030405Z
  expires: number;
  signedHeaders: Record<string, string>; // lower-case names -> values (host included)
}): string {
  const date = opts.amzDate.slice(0, 8);
  const scope = `${date}/${opts.region}/s3/aws4_request`;
  const names = Object.keys(opts.signedHeaders).sort();
  const enc = (s: string) => encodeURIComponent(s);
  const params: [string, string][] = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", `${opts.accessKey}/${scope}`],
    ["X-Amz-Date", opts.amzDate],
    ["X-Amz-Expires", String(opts.expires)],
    ["X-Amz-SignedHeaders", names.join(";")],
  ];
  params.sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const query = params.map(([k, v]) => `${enc(k)}=${enc(v)}`).join("&");
  const canonicalHeaders = names.map((n) => `${n}:${opts.signedHeaders[n].trim()}\n`).join("");
  const canonicalRequest = `${opts.method}\n${opts.uri}\n${query}\n${canonicalHeaders}\n${names.join(";")}\nUNSIGNED-PAYLOAD`;
  const toSign = `AWS4-HMAC-SHA256\n${opts.amzDate}\n${scope}\n${createHash("sha256").update(canonicalRequest).digest("hex")}`;
  let key: Buffer = createHmac("sha256", `AWS4${opts.secret}`).update(date).digest();
  for (const part of [opts.region, "s3", "aws4_request"]) key = createHmac("sha256", key).update(part).digest();
  const signature = createHmac("sha256", key).update(toSign).digest("hex");
  return `https://${opts.host}${opts.uri}?${query}&X-Amz-Signature=${signature}`;
}

const CONFIG = {
  accountId: "0123456789abcdef0123456789abcdef",
  accessKeyId: "AKIDEXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
  bucket: "atelier-assets",
};
const NOW = new Date("2025-01-02T03:04:05Z");
const KEY = "a/6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e5f/w1024.webp";

describe("presignPut", () => {
  it("matches the reference SigV4 signature for a PUT with a signed content-type", () => {
    const url = presignPut({ key: KEY, contentType: "image/webp", expiresSeconds: 600, now: NOW, config: CONFIG });
    const host = `${CONFIG.accountId}.r2.cloudflarestorage.com`;
    expect(url).toBe(
      referenceSign({
        method: "PUT",
        host,
        uri: `/${CONFIG.bucket}/${KEY}`,
        accessKey: CONFIG.accessKeyId,
        secret: CONFIG.secretAccessKey,
        region: "auto",
        amzDate: "20250102T030405Z",
        expires: 600,
        signedHeaders: { host, "content-type": "image/webp" },
      }),
    );
  });

  it("is a stable known vector (guards accidental changes to the algorithm)", () => {
    const url = presignPut({ key: KEY, contentType: "image/webp", now: NOW, config: CONFIG });
    expect(url.endsWith("X-Amz-Signature=750516a1115399d3529e3a89f2d56b74ee921101c1c8f026e4e8cc1b2cb0ced5")).toBe(true);
  });

  it("signs the content type and the PUT method: either changing breaks the signature", () => {
    const base = { key: KEY, now: NOW, config: CONFIG, expiresSeconds: 600 };
    const sig = (u: string) => u.slice(u.lastIndexOf("X-Amz-Signature=") + 16);
    const webp = presignPut({ ...base, contentType: "image/webp" });
    const png = presignPut({ ...base, contentType: "image/png" });
    expect(sig(webp)).not.toBe(sig(png));
    const get = presignUrl({
      method: "GET",
      host: `${CONFIG.accountId}.r2.cloudflarestorage.com`,
      path: `/${CONFIG.bucket}/${KEY}`,
      accessKeyId: CONFIG.accessKeyId,
      secretAccessKey: CONFIG.secretAccessKey,
      region: "auto",
      expiresSeconds: 600,
      now: NOW,
    });
    expect(sig(get)).not.toBe(sig(webp));
    expect(new URL(webp).searchParams.get("X-Amz-SignedHeaders")).toBe("content-type;host");
    expect(new URL(get).searchParams.get("X-Amz-SignedHeaders")).toBe("host");
  });

  it("uses the default 10 minute expiry, path-style bucket URLs and keeps key slashes", () => {
    const url = new URL(presignPut({ key: KEY, contentType: "image/webp", now: NOW, config: CONFIG }));
    expect(url.host).toBe(`${CONFIG.accountId}.r2.cloudflarestorage.com`);
    expect(url.pathname).toBe(`/${CONFIG.bucket}/${KEY}`);
    expect(url.searchParams.get("X-Amz-Expires")).toBe("600");
    expect(url.searchParams.get("X-Amz-Credential")).toBe(`AKIDEXAMPLE/20250102/auto/s3/aws4_request`);
  });

  it("never leaks the secret key into the URL", () => {
    const url = presignPut({ key: KEY, contentType: "image/webp", now: NOW, config: CONFIG });
    expect(url).not.toContain(CONFIG.secretAccessKey);
    expect(url).not.toContain(encodeURIComponent(CONFIG.secretAccessKey));
  });

  it("throws when storage is not configured", () => {
    expect(() => presignPut({ key: KEY, contentType: "image/webp", config: null })).toThrow(/R2/);
  });
});

describe("presignUrl core", () => {
  it("still reproduces AWS's published GET example", () => {
    // docs.aws.amazon.com/AmazonS3/latest/API/sigv4-query-string-auth.html
    const url = presignUrl({
      method: "GET",
      host: "examplebucket.s3.amazonaws.com",
      path: "/test.txt",
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      region: "us-east-1",
      expiresSeconds: 86400,
      now: new Date("2013-05-24T00:00:00Z"),
    });
    expect(url.endsWith("X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404")).toBe(true);
  });
});

describe("r2Config", () => {
  it("reads the R2 variables and returns null when any is missing", () => {
    expect(
      r2Config({ R2_ACCOUNT_ID: "a", R2_ACCESS_KEY_ID: "k", R2_SECRET_ACCESS_KEY: "s", R2_BUCKET: "b" }),
    ).toEqual({ accountId: "a", accessKeyId: "k", secretAccessKey: "s", bucket: "b" });
    expect(r2Config({ R2_ACCOUNT_ID: "a", R2_ACCESS_KEY_ID: "k", R2_SECRET_ACCESS_KEY: "s" })).toBeNull();
    expect(r2Config({})).toBeNull();
  });
});

describe("asset ids and keys", () => {
  it("makes unguessable 128-bit ids that fit the assets.id uuid column", () => {
    const ids = new Set(Array.from({ length: 200 }, () => newAssetId()));
    expect(ids.size).toBe(200);
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(isAssetId(id)).toBe(true);
    }
    expect(isAssetId("../etc/passwd")).toBe(false);
    expect(isAssetId("")).toBe(false);
    expect(isAssetId("A".repeat(36))).toBe(false);
  });

  it("derives the object keys", () => {
    const id = "6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e5f";
    expect(assetKey(id, "original")).toBe(`a/${id}/original`);
    expect(assetKey(id, "w1024")).toBe(`a/${id}/w1024.webp`);
  });
});


describe("presignAssetUploads", () => {
  const config = { accountId: "0123456789abcdef0123456789abcdef", accessKeyId: "AKID", secretAccessKey: "s3cret", bucket: "bkt" };
  const id = "6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e5f";

  it("signs the original with its own type and each asked-for variant as image/webp, and nothing else", () => {
    const u = presignAssetUploads({ assetId: id, mime: "image/png", variants: ["w256", "w2048"], config, now: new Date("2026-01-02T03:04:05Z") });
    expect(Object.keys(u).sort()).toEqual(["original", "w2048", "w256"]);
    expect(new URL(u.original!).pathname).toBe(`/bkt/a/${id}/original`);
    expect(new URL(u.w256!).pathname).toBe(`/bkt/a/${id}/w256.webp`);
    expect(new URL(u.w2048!).pathname).toBe(`/bkt/a/${id}/w2048.webp`);
    // Different content type signed => different signatures even for the same time.
    expect(new URL(u.original!).searchParams.get("X-Amz-Signature")).not.toBe(new URL(u.w256!).searchParams.get("X-Amz-Signature"));
    expect(Object.values(u).join("")).not.toContain("s3cret");
  });

  it("matches presignPut for the same key", () => {
    const now = new Date("2026-01-02T03:04:05Z");
    const u = presignAssetUploads({ assetId: id, mime: "image/jpeg", variants: ["w256"], config, now });
    expect(u.w256).toBe(presignPut({ key: assetKey(id, "w256"), contentType: "image/webp", config, now }));
  });

  it("assetKey names every variant", () => {
    expect(assetKey(id, "w256")).toBe(`a/${id}/w256.webp`);
    expect(assetKey(id, "w2048")).toBe(`a/${id}/w2048.webp`);
    expect(assetKey(id, "original")).toBe(`a/${id}/original`);
  });

  it("throws when R2 is not configured", () => {
    expect(() => presignAssetUploads({ assetId: id, mime: "image/png", variants: [], config: null })).toThrow();
  });
});
