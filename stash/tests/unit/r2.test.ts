import { describe, expect, it } from "vitest";
import { presignGet } from "@/lib/r2";

describe("presignGet", () => {
  it("matches AWS's published Signature V4 presigned-URL example", () => {
    // docs.aws.amazon.com/AmazonS3/latest/API/sigv4-query-string-auth.html
    const url = presignGet({
      host: "examplebucket.s3.amazonaws.com",
      path: "/test.txt",
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      region: "us-east-1",
      expiresSeconds: 86400,
      now: new Date("2013-05-24T00:00:00Z"),
    });
    expect(url).toContain("X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request");
    expect(url.endsWith("X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404")).toBe(true);
  });

  it("keeps slashes in the key and encodes the rest", () => {
    const url = presignGet({
      host: "acc.r2.cloudflarestorage.com",
      path: "/bucket/user id/save.mp4",
      accessKeyId: "k",
      secretAccessKey: "s",
      region: "auto",
      expiresSeconds: 60,
    });
    expect(url.startsWith("https://acc.r2.cloudflarestorage.com/bucket/user%20id/save.mp4?")).toBe(true);
  });
});
