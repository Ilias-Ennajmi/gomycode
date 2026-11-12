// What the server hands the client for first paint (types only; built by lib/server/share-page.ts).
import type { ViewerBoard } from "./viewer-types";

export type SharePageData =
  | { kind: "gone" }
  | { kind: "password"; studioName: string; linkKey: string }
  | { kind: "error" }
  | { kind: "ready"; studioName: string; linkKey: string; hasSession: boolean; visitorName: string | null; title: string; board: ViewerBoard };
