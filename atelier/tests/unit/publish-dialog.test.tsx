import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { PublishDialog } from "@/components/rounds/PublishDialog";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { docFromState } from "@/lib/engine/doc/from-state";
import { PublishError, type PublishedRound } from "@/lib/engine/export/preview";
import { defaultsFor } from "@/lib/engine/model/defaults";
import type { NewObject } from "@/lib/engine/model/types";
import { RoundsRequestError, type RoundsClient } from "@/lib/engine/rounds/client";
import { EMPTY_ROUND_DIFF, type Round } from "@/lib/share/round-types";

const round = (n: number, over: Partial<Round> = {}): Round => ({ id: `r${n}`, boardId: "b1", number: n, label: `Round ${n}`, snapshotId: `s${n}`, previews: {}, diff: EMPTY_ROUND_DIFF, publishedAt: "2026-11-01T10:00:00Z", ...over });
const shape = (id: string, over: Record<string, unknown> = {}) => ({ ...defaultsFor("shape"), id, ...over }) as unknown as NewObject;

/** A board with frame "f1" (named Hero) holding shapes a and b. */
function board() {
  const doc = new BoardDoc();
  doc.create({ ...defaultsFor("frame"), id: "f1", name: "Hero" } as unknown as NewObject);
  doc.create(shape("a", { parentId: "f1" }));
  doc.create(shape("b", { parentId: "f1" }));
  return doc;
}

function fakeClient(over: Partial<RoundsClient> = {}): RoundsClient {
  return {
    listRounds: async () => [],
    listHistory: async () => [],
    fetchSnapshot: async () => new Uint8Array(),
    createSnapshot: async () => "snap",
    prepare: async () => ({ previewToken: "t", uploads: {} }),
    create: async () => round(1),
    ...over,
  };
}

const toast = vi.fn();
function mount(doc: BoardDoc, client: RoundsClient, extra: Partial<Parameters<typeof PublishDialog>[0]> = {}) {
  const flow = vi.fn(async (_d: unknown, label: string): Promise<PublishedRound> => ({ ...round(3, { label: label || "Round 3" }), warnings: [] }));
  const onClose = vi.fn();
  const utils = render(
    <PublishDialog
      boardId="b1"
      doc={doc}
      client={client}
      sync={{ flush: async () => {} }}
      exporter={{ run: vi.fn() } as never}
      assets={{ available: () => null, urlsFor: () => ({}) }}
      toast={toast}
      onClose={onClose}
      onOpenRounds={() => {}}
      flow={flow as never}
      {...extra}
    />,
  );
  return { flow, onClose, ...utils };
}

beforeEach(() => toast.mockClear());
afterEach(() => vi.restoreAllMocks());

/** The state of a copy of `doc` with the given edits applied, as the previous round's snapshot. */
function stateOf(from: BoardDoc, edit: (d: BoardDoc) => void): Uint8Array {
  const d = docFromState(Y.encodeStateAsUpdate(from.ydoc));
  edit(d);
  const s = Y.encodeStateAsUpdate(d.ydoc);
  d.destroy();
  return s;
}

describe("PublishDialog", () => {
  it("is a dialog with a label field (max 120) and a Publish button", async () => {
    mount(board(), fakeClient());
    const dialog = await screen.findByRole("dialog", { name: /publish round/i });
    const label = within(dialog).getByLabelText(/label/i) as HTMLInputElement;
    expect(label.maxLength).toBe(120);
    expect(within(dialog).getByRole("button", { name: /^publish$/i })).toBeEnabled();
  });

  it("with no earlier round, says everything is included", async () => {
    mount(board(), fakeClient());
    expect(await screen.findByText(/first round/i)).toBeInTheDocument();
  });

  it("shows what changed since the previous round: counts and the frames", async () => {
    const doc = board();
    const prev = stateOf(doc, (d) => {
      d.remove(["b"]); // b is new since the round
      d.update("a", { x: 3 }); // a moved since
    });
    // current board: add c, move a again
    doc.create(shape("c", { parentId: "f1" }));
    const client = fakeClient({ listRounds: async () => [round(2)], fetchSnapshot: async () => prev });
    mount(doc, client);
    const summary = await screen.findByTestId("publish-changes");
    await waitFor(() => expect(summary).toHaveTextContent(/Since Round 2/));
    expect(summary).toHaveTextContent(/2 added/); // b and c
    expect(summary).toHaveTextContent(/1 changed/); // a
    expect(summary).toHaveTextContent(/0 removed/);
    expect(summary).toHaveTextContent(/Hero/);
    expect(summary).toHaveTextContent(/Hero.*2 added · 1 changed/);
  });

  it("says so when nothing changed, and still allows publishing", async () => {
    const doc = board();
    const same = Y.encodeStateAsUpdate(doc.ydoc);
    mount(doc, fakeClient({ listRounds: async () => [round(2)], fetchSnapshot: async () => same }));
    expect(await screen.findByText(/no changes since round 2/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^publish$/i })).toBeEnabled();
  });

  it("when the server is not available, says so and does not offer to publish", async () => {
    mount(board(), fakeClient({ listRounds: async () => { throw new RoundsRequestError(503, "not-configured"); } }));
    expect(await screen.findByText(/needs the server/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^publish$/i })).toBeDisabled();
  });

  it("publishes with the label, shows progress and a Cancel, then toasts with a way to open the Rounds panel", async () => {
    let finish!: (r: PublishedRound) => void;
    let report!: (r: number, l: string) => void;
    let seen: AbortSignal | undefined;
    const flow = vi.fn((_d: unknown, _label: string, signal: AbortSignal, onProgress: (r: number, l: string) => void) => {
      seen = signal;
      report = onProgress;
      return new Promise<PublishedRound>((res) => (finish = res));
    });
    const onOpenRounds = vi.fn();
    const { onClose } = mount(board(), fakeClient(), { flow: flow as never, onOpenRounds });
    fireEvent.change(await screen.findByLabelText(/label/i), { target: { value: "Direction A" } });
    fireEvent.click(screen.getByRole("button", { name: /^publish$/i }));
    await waitFor(() => expect(flow).toHaveBeenCalled());
    expect(flow.mock.calls[0][1]).toBe("Direction A");
    act(() => report(0.5, "Rendering Hero (1 of 1)"));
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "50");
    expect(screen.getByText(/rendering hero/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
    await act(async () => finish({ ...round(3, { label: "Direction A" }), warnings: [] }));
    expect(seen?.aborted).toBe(false);
    expect(onClose).toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("Round 3"), action: expect.objectContaining({ label: expect.stringMatching(/rounds/i) }) }));
    toast.mock.calls[0][0].action.run();
    expect(onOpenRounds).toHaveBeenCalled();
  });

  it("Cancel aborts the flow's signal and returns to the form without publishing", async () => {
    let signal!: AbortSignal;
    const flow = vi.fn((_d: unknown, _l: string, s: AbortSignal) => {
      signal = s;
      return new Promise<PublishedRound>((_res, rej) => s.addEventListener("abort", () => rej(new PublishError("cancelled", "Publishing was cancelled."))));
    });
    const { onClose } = mount(board(), fakeClient(), { flow: flow as never });
    fireEvent.click(await screen.findByRole("button", { name: /^publish$/i }));
    await waitFor(() => expect(flow).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    await waitFor(() => expect(signal.aborted).toBe(true));
    expect(await screen.findByRole("button", { name: /^publish$/i })).toBeEnabled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument(); // a cancel is not an error
  });

  it("when previews had trouble the dialog stays open and lists the warnings", async () => {
    const flow = vi.fn(async (): Promise<PublishedRound> => ({ ...round(1), warnings: ["Published without preview images — clients will see a slightly slower first load"] }));
    const { onClose } = mount(board(), fakeClient(), { flow: flow as never });
    fireEvent.click(await screen.findByRole("button", { name: /^publish$/i }));
    expect(await screen.findByText(/published without preview images/i)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent(/Round 1 is published/i);
    fireEvent.click(screen.getByRole("button", { name: /done/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it("shows a failure in an alert and keeps the form so it can be retried", async () => {
    const flow = vi.fn(async () => {
      throw new PublishError("not-synced", "The server doesn't have your latest edits yet.");
    });
    mount(board(), fakeClient(), { flow: flow as never });
    fireEvent.click(await screen.findByRole("button", { name: /^publish$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/latest edits/);
    expect(screen.getByRole("button", { name: /^publish$/i })).toBeEnabled();
  });

  it("Escape while publishing cancels it", async () => {
    let signal!: AbortSignal;
    const flow = vi.fn((_d: unknown, _l: string, s: AbortSignal) => {
      signal = s;
      return new Promise<PublishedRound>(() => {});
    });
    const { onClose } = mount(board(), fakeClient(), { flow: flow as never });
    fireEvent.click(await screen.findByRole("button", { name: /^publish$/i }));
    await waitFor(() => expect(flow).toHaveBeenCalled());
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(signal.aborted).toBe(true);
    expect(onClose).toHaveBeenCalled();
  });
});
