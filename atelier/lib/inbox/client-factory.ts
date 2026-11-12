import type { AssetUploader } from "@/lib/assets/upload-queue";
import { createHttpInboxApi, createLocalInboxApi, InboxClient, type InboxClientDeps } from "./inbox-client";

/**
 * The InboxClient for this page: the server's Inbox signed in, the browser's own in local-only mode. When an uploader is
 * given, an image or video item waits until its asset has finished uploading (the server only knows an asset once it is
 * complete) and is sent as soon as the uploader says something changed.
 */
export function createInboxClient(opts: { localOnly: boolean; uploader?: Pick<AssetUploader, "items" | "subscribe">; onRejected?: InboxClientDeps["onRejected"]; fetchFn?: typeof fetch }): InboxClient {
  const { uploader } = opts;
  const client = new InboxClient({
    api: opts.localOnly ? createLocalInboxApi() : createHttpInboxApi(opts.fetchFn),
    assetReady: uploader ? (assetId) => !uploader.items().some((i) => i.assetId === assetId) : undefined,
    onRejected: opts.onRejected,
  });
  const off = uploader?.subscribe(() => client.retry());
  const dispose = client.dispose.bind(client);
  client.dispose = () => {
    off?.();
    dispose();
  };
  return client;
}
