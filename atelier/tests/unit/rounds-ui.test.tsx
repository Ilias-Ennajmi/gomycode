import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoundsMenu } from "@/components/chrome/RoundsMenu";
import { BoardInfoProvider } from "@/components/rounds/BoardInfo";
import { RoundsHost } from "@/components/rounds/RoundsHost";
import { registry } from "@/lib/engine/commands/registry";
import "@/lib/engine/commands/commands";
import { roundsUi } from "@/lib/engine/rounds/ui-store";
import { makeEditor, obj } from "./helpers/editor";

beforeEach(() => {
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }));
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ rounds: [] }), { status: 200, headers: { "content-type": "application/json" } })));
});
afterEach(() => {
  roundsUi.close();
  vi.unstubAllGlobals();
});

describe("round commands", () => {
  it("registers publish, compare, rounds and history", () => {
    for (const id of ["round.publish", "round.compare", "rounds.open", "history.open"]) expect(registry.has(id)).toBe(true);
    expect(registry.get("round.publish").label).toBe("Publish round…");
  });

  it("round.publish and round.compare ask for their UI; the panels toggle through the editor", () => {
    const ed = makeEditor([obj("shape", "a")]);
    const togglePanel = vi.fn();
    const base = { doc: ed.doc, selection: ed.selection, canvas: ed.handle, setTool() {}, toast() {}, clipboardStyle: { current: null }, ui: { togglePanel } } as never;
    registry.run("round.publish", base);
    expect(roundsUi.current).toEqual({ kind: "publish" });
    registry.run("round.compare", base);
    expect(roundsUi.current).toEqual({ kind: "compare" });
    registry.run("rounds.open", base);
    registry.run("history.open", base);
    expect(togglePanel.mock.calls).toEqual([["rounds"], ["history"]]);
    // the panel commands are unavailable without a panel host (they would do nothing)
    expect(registry.available("rounds.open", { ...(base as object), ui: {} } as never)).toBe(false);
  });
});

describe("RoundsMenu", () => {
  it("is a labelled menu button listing the four commands, and Publish round… opens the dialog", async () => {
    const ed = makeEditor([obj("shape", "a")], { boardId: "b1" });
    render(
      ed.wrap(
        <BoardInfoProvider value={{ boardId: "b1", localOnly: false, sync: { flush: async () => {}, status: "saved" } }}>
          <RoundsMenu />
          <RoundsHost />
        </BoardInfoProvider>,
      ),
    );
    const button = screen.getByRole("button", { name: /rounds and history/i });
    expect(button).toHaveAttribute("aria-haspopup", "menu");
    fireEvent.click(button);
    const menu = await screen.findByRole("menu", { name: /rounds and history/i });
    const items = within(menu).getAllByRole("menuitem").map((i) => i.textContent);
    // the panel entries only exist where a panel host is mounted (the editor provider here has none of its own: it does)
    expect(items).toEqual(["Publish round…", "Rounds", "Compare rounds…", "Version history"]);
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Publish round…" }));
    expect(await screen.findByRole("dialog", { name: /publish round/i })).toBeInTheDocument();
  });

  it("renders nothing outside an editor", () => {
    const { container } = render(<RoundsMenu />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("RoundsHost", () => {
  it("shows nothing until asked, and nothing without a board (a bare editor)", () => {
    const ed = makeEditor([obj("shape", "a")]);
    render(ed.wrap(<RoundsHost />));
    act(() => roundsUi.open({ kind: "publish" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes the dialog on request and Close", async () => {
    const ed = makeEditor([obj("shape", "a")]);
    render(ed.wrap(<BoardInfoProvider value={{ boardId: "b1", localOnly: true, sync: null }}><RoundsHost /></BoardInfoProvider>));
    act(() => roundsUi.open({ kind: "publish" }));
    const dialog = await screen.findByRole("dialog", { name: /publish round/i });
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(roundsUi.current).toBeNull();
  });
});
