process.env.TZ = "UTC";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { HistoryPanel } from "@/components/panels/HistoryPanel";
import { RoundsPanel } from "@/components/panels/RoundsPanel";
import { BoardInfoProvider } from "@/components/rounds/BoardInfo";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { defaultsFor } from "@/lib/engine/model/defaults";
import type { NewObject } from "@/lib/engine/model/types";
import { RoundsRequestError, type HistoryVersion, type RoundsClient } from "@/lib/engine/rounds/client";
import { roundsUi } from "@/lib/engine/rounds/ui-store";
import { EMPTY_ROUND_DIFF, type Round } from "@/lib/share/round-types";
import { makeEditor, obj } from "./helpers/editor";

const round = (n: number, over: Partial<Round> = {}): Round => ({
  id: `r${n}`, boardId: "b1", number: n, label: `Round ${n}`, snapshotId: `s${n}`, previews: {}, diff: EMPTY_ROUND_DIFF, publishedAt: `2026-11-0${n}T10:30:00Z`, ...over,
});
const diff = (added: number, changed: number, removed: number) => ({ added: [], removed: [], changed: [], byFrame: { f1: { added, changed, removed } }, truncated: false });
const v = (over: Partial<HistoryVersion>): HistoryVersion => ({ id: "x", kind: "compaction", label: null, roundNumber: null, createdAt: "2026-11-10T09:30:00Z", uptoSeq: 1, ...over });

function client(over: Partial<RoundsClient> = {}): RoundsClient {
  return {
    listRounds: async () => [],
    listHistory: async () => [],
    fetchSnapshot: async () => Y.encodeStateAsUpdate(new BoardDoc().ydoc),
    createSnapshot: async () => "snap",
    prepare: async () => ({ previewToken: "t", uploads: {} }),
    create: async () => { throw new Error("unused"); },
    ...over,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ links: [] }), { status: 200, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }));
});
afterEach(() => {
  roundsUi.close();
  vi.unstubAllGlobals();
});

function mountPanel(ui: React.ReactElement, withBoard = true) {
  const ed = makeEditor([obj("shape", "a")]);
  const tree = withBoard ? <BoardInfoProvider value={{ boardId: "b1", localOnly: false, sync: { flush: async () => {}, status: "saved" } }}>{ui}</BoardInfoProvider> : ui;
  return { ed, ...render(ed.wrap(tree)) };
}

describe("RoundsPanel", () => {
  it("lists rounds newest first with label, date, what changed and how many links point at each", async () => {
    const rounds = [round(1, { diff: diff(12, 0, 0) }), round(2, { label: "Direction B", diff: diff(3, 5, 1) })];
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ links: [{ id: "l1", roundId: "r2", status: "ok" }, { id: "l2", roundId: "r2", status: "ok" }, { id: "l3", roundId: "r2", status: "revoked" }, { id: "l4", roundId: null, status: "ok" }] }), { status: 200 }));
    mountPanel(<RoundsPanel client={client({ listRounds: async () => [rounds[1], rounds[0]] })} />);
    const list = await screen.findByRole("list", { name: /rounds/i });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Round 2 · Direction B");
    expect(items[0]).toHaveTextContent(/3 added/);
    expect(items[0]).toHaveTextContent(/5 changed/);
    expect(items[0]).toHaveTextContent(/1 removed/);
    expect(items[0]).toHaveTextContent(/2 links/);
    expect(items[0]).toHaveTextContent(/2 Nov/);
    expect(items[1]).toHaveTextContent("Round 1");
    expect(items[1]).toHaveTextContent(/first round/i);
    expect(items[1]).not.toHaveTextContent(/link/);
  });

  it("has a Publish round… button that runs the command", async () => {
    mountPanel(<RoundsPanel client={client()} />);
    fireEvent.click(await screen.findByRole("button", { name: /publish round/i }));
    expect(roundsUi.current).toEqual({ kind: "publish" });
  });

  it("says what a round is when there are none", async () => {
    mountPanel(<RoundsPanel client={client()} />);
    expect(await screen.findByText(/no rounds yet/i)).toBeInTheDocument();
  });

  it.each([
    [new RoundsRequestError(503, "not-configured")],
    [new RoundsRequestError(503, "local-only")],
  ])("without the server it says so plainly and does not crash (%#)", async (error) => {
    mountPanel(<RoundsPanel client={client({ listRounds: async () => { throw error; } })} />);
    expect(await screen.findByText(/rounds need the server/i)).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: /rounds/i })).not.toBeInTheDocument();
  });

  it("outside a board page it says the same instead of failing", () => {
    mountPanel(<RoundsPanel client={client()} />, false);
    expect(screen.getByText(/rounds need the server/i)).toBeInTheDocument();
  });

  it("another failure shows a message and Retry reloads", async () => {
    const listRounds = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValue([round(1)]);
    mountPanel(<RoundsPanel client={client({ listRounds })} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn.t load/i);
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(await screen.findByRole("list", { name: /rounds/i })).toBeInTheDocument();
  });

  it("Compare with current opens the compare page for that round", async () => {
    const { ed } = mountPanel(<RoundsPanel client={client({ listRounds: async () => [round(2), round(1)] })} />);
    const items = await screen.findAllByRole("listitem");
    fireEvent.click(within(items[0]).getByRole("button", { name: /compare with current/i }));
    expect(ed.navigate).toHaveBeenCalledWith("/b/b1/compare?a=s2&b=current");
  });

  it("two selected rounds can be compared, older as A", async () => {
    const { ed } = mountPanel(<RoundsPanel client={client({ listRounds: async () => [round(3), round(2), round(1)] })} />);
    const items = await screen.findAllByRole("listitem");
    const compareSelected = () => screen.queryByRole("button", { name: /compare selected/i });
    expect(compareSelected()).not.toBeInTheDocument();
    fireEvent.click(within(items[0]).getByRole("checkbox", { name: /select round 3/i }));
    expect(compareSelected()).toBeDisabled();
    fireEvent.click(within(items[2]).getByRole("checkbox", { name: /select round 1/i }));
    expect(compareSelected()).toBeEnabled();
    // a third can't be added: the others stay checkable only after unchecking
    expect(within(items[1]).getByRole("checkbox", { name: /select round 2/i })).toBeDisabled();
    fireEvent.click(compareSelected()!);
    expect(ed.navigate).toHaveBeenCalledWith("/b/b1/compare?a=s1&b=s3");
  });

  it("Restore… opens the restore dialog for that round", async () => {
    mountPanel(<RoundsPanel client={client({ listRounds: async () => [round(2)] })} />);
    const item = (await screen.findAllByRole("listitem"))[0];
    fireEvent.click(within(item).getByRole("button", { name: /restore/i }));
    expect(await screen.findByRole("dialog", { name: /restore round 2/i })).toBeInTheDocument();
  });

  it("exposes nothing destructive: there is no delete button on a round", async () => {
    mountPanel(<RoundsPanel client={client({ listRounds: async () => [round(2)] })} />);
    await screen.findByRole("list", { name: /rounds/i });
    expect(screen.queryByRole("button", { name: /delete|remove/i })).not.toBeInTheDocument();
  });
});

describe("HistoryPanel", () => {
  it("groups versions by day, newest first, with time, label and what kind", async () => {
    const versions = [
      v({ id: "c3", createdAt: "2026-11-10T16:05:00Z", label: "Before restore" }),
      v({ id: "r2", kind: "round", roundNumber: 2, label: "Direction B", createdAt: "2026-11-10T09:30:00Z" }),
      v({ id: "c1", createdAt: "2026-11-08T07:00:00Z" }),
    ];
    mountPanel(<HistoryPanel client={client({ listHistory: async () => versions })} />);
    const groups = await screen.findAllByRole("group");
    expect(groups).toHaveLength(2);
    expect(groups[0]).toHaveAccessibleName(/10 Nov/);
    expect(within(groups[0]).getAllByRole("listitem")).toHaveLength(2);
    expect(groups[0]).toHaveTextContent("Before restore");
    expect(groups[0]).toHaveTextContent("Round 2 · Direction B");
    expect(groups[1]).toHaveAccessibleName(/8 Nov/);
  });

  it("Compare with current and Restore… per version", async () => {
    const { ed } = mountPanel(<HistoryPanel client={client({ listHistory: async () => [v({ id: "c1" })] })} />);
    const item = (await screen.findAllByRole("listitem"))[0];
    fireEvent.click(within(item).getByRole("button", { name: /compare with current/i }));
    expect(ed.navigate).toHaveBeenCalledWith("/b/b1/compare?a=c1&b=current");
    fireEvent.click(within(item).getByRole("button", { name: /restore/i }));
    expect(await screen.findByRole("dialog", { name: /restore/i })).toBeInTheDocument();
  });

  it("explains an empty history and the 30-day window", async () => {
    mountPanel(<HistoryPanel client={client()} />);
    expect(await screen.findByText(/30 days/i)).toBeInTheDocument();
  });

  it("without the server it says so", async () => {
    mountPanel(<HistoryPanel client={client({ listHistory: async () => { throw new RoundsRequestError(503, "not-configured"); } })} />);
    expect(await screen.findByText(/version history needs the server/i)).toBeInTheDocument();
  });
});
