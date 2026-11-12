import { createHash, createHmac } from "node:crypto";
import { assetKey, type AssetVariant } from "@/lib/assets/asset-id";
import { VARIANT_NAMES, type VariantName } from "@/lib/assets/variants";

/*
 * Presigned URLs for Cloudflare R2 (S3 Signature Version 4, query-string auth). Hand-written, like stash/lib/r2.ts,
 * to avoid pulling the AWS SDK into the app. Atelier signs PUTs: the browser uploads straight to R2, and the signed
 * Content-Type header means the URL only works for the type the server approved.
 */

const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const hmac = (key: Buffer | string, s: string) => createHmac("sha256", key).update(s).digest();

export type PresignInput = {
  method: "GET" | "PUT" | "DELETE";
  host: string;
  /** Path including the bucket for path-style URLs, e.g. "/bucket/a/id/original". Unencoded. */
  path: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  expiresSeconds: number;
  /** Extra headers the caller must send unchanged (names lower-case), e.g. { "content-type": "image/webp" }. */
  signedHeaders?: Record<string, string>;
  now?: Date;
};

export function presignUrl({
  method,
  host,
  path,
  accessKeyId,
  secretAccessKey,
  region,
  expiresSeconds,
  signedHeaders = {},
  now = new Date(),
}: PresignInput): string {
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const day = amzDate.slice(0, 8);
  const scope = `${day}/${region}/s3/aws4_request`;
  const canonicalUri = path
    .split("/")
    .map((seg) => enc(seg))
    .join("/");

  const headers: Record<string, string> = { host };
  for (const [k, v] of Object.entries(signedHeaders)) headers[k.toLowerCase()] = v.trim();
  const names = Object.keys(headers).sort();
  const signedList = names.join(";");

  const query: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${accessKeyId}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expiresSeconds),
    "X-Amz-SignedHeaders": signedList,
  };
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((k) => `${enc(k)}=${enc(query[k])}`)
    .join("&");
  const canonicalHeaders = names.map((n) => `${n}:${headers[n]}\n`).join("");
  const canonicalRequest = [method, canonicalUri, canonicalQuery, canonicalHeaders, signedList, "UNSIGNED-PAYLOAD"].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonicalRequest)].join("\n");
  const kSigning = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, day), region), "s3"), "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign).digest("hex");
  return `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

export type R2Config = { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string };

export function r2Config(env: Record<string, string | undefined> = process.env): R2Config | null {
  const accountId = env.R2_ACCOUNT_ID;
  const accessKeyId = env.R2_ACCESS_KEY_ID;
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY;
  const bucket = env.R2_BUCKET;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
  return { accountId, accessKeyId, secretAccessKey, bucket };
}

/**
 * A URL the browser can PUT one object to for `expiresSeconds`. The upload must send exactly
 * `Content-Type: contentType`. Throws when R2 is not configured (callers answer 503).
 */
export function presignPut({
  key,
  contentType,
  expiresSeconds = 600,
  now,
  config = r2Config(),
}: {
  key: string;
  contentType: string;
  expiresSeconds?: number;
  now?: Date;
  config?: R2Config | null;
}): string {
  if (!config) throw new Error("R2 is not configured");
  return presignUrl({
    method: "PUT",
    host: `${config.accountId}.r2.cloudflarestorage.com`,
    path: `/${config.bucket}/${key}`,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    region: "auto",
    expiresSeconds,
    signedHeaders: { "content-type": contentType },
    now,
  });
}

/**
 * Upload URLs for one asset: the original (PUT with the file's own Content-Type) and each requested WebP variant.
 * Nothing for a variant that was not asked for.
 */
export function presignAssetUploads({
  assetId,
  mime,
  variants,
  expiresSeconds,
  now,
  config = r2Config(),
}: {
  assetId: string;
  mime: string;
  variants: readonly VariantName[];
  expiresSeconds?: number;
  now?: Date;
  config?: R2Config | null;
}): Partial<Record<AssetVariant, string>> {
  const common = { expiresSeconds, now, config };
  const uploads: Partial<Record<AssetVariant, string>> = {
    original: presignPut({ key: assetKey(assetId, "original"), contentType: mime, ...common }),
  };
  for (const v of variants) uploads[v] = presignPut({ key: assetKey(assetId, v), contentType: "image/webp", ...common });
  return uploads;
}

/** Why an asset's objects could not be removed: nothing configured, or R2 refused / could not be reached. */
export class StorageDeleteError extends Error {
  constructor(readonly reason: "not-configured" | "failed") {
    super(reason === "not-configured" ? "R2 is not configured" : "R2 did not delete the objects");
  }
}

/**
 * Deletes every stored file of one asset (the original and each WebP variant) with presigned DELETE requests. A file that
 * is already gone (404) counts as deleted, so a retry after a partial failure finishes the job. Throws StorageDeleteError
 * when R2 is not configured or any file could not be deleted: the caller keeps the database row so nothing is left behind
 * silently.
 */
export async function deleteAssetObjects(
  assetId: string,
  opts: { config?: R2Config | null; fetchFn?: typeof fetch; now?: Date } = {},
): Promise<void> {
  const config = opts.config === undefined ? r2Config() : opts.config;
  if (!config) throw new StorageDeleteError("not-configured");
  const f = opts.fetchFn ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a));
  const files: AssetVariant[] = ["original", ...VARIANT_NAMES];
  const results = await Promise.allSettled(
    files.map(async (variant) => {
      const url = presignUrl({
        method: "DELETE",
        host: `${config.accountId}.r2.cloudflarestorage.com`,
        path: `/${config.bucket}/${assetKey(assetId, variant)}`,
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        region: "auto",
        expiresSeconds: 60,
        now: opts.now,
      });
      const res = await f(url, { method: "DELETE" });
      if (!res.ok && res.status !== 404) throw new Error(`delete ${variant}: ${res.status}`);
    }),
  );
  if (results.some((r) => r.status === "rejected")) throw new StorageDeleteError("failed");
}
