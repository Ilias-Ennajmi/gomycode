import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { UsedInBoards, resetUsedInBoardsCache } from "@/components/panels/UsedInBoards";

const A = "6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e01";
const B = "6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e02";

const answer = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => resetUsedInBoardsCache());
afterEach(() => vi.unstubAllGlobals());

describe("UsedInBoards (Inspector)", () => {
  it("says how many boards use the selected image and names them", async () => {
    const f = vi.fn(async () => answer({ usedIn: 3, boards: [{ id: "b1", title: "Harbour" }, { id: "b2", title: "<i>Pier</i>" }, { id: "b3", title: "Dawn" }] }));
    vi.stubGlobal("fetch", f);
    render(<UsedInBoards assetId={A} />);
    expect(await screen.findByText("Used in 3 boards")).toBeInTheDocument();
    expect(f).toHaveBeenCalledWith(`/api/assets/${A}`, expect.anything());
    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual(["Harbour", "<i>Pier</i>", "Dawn"]); // escaped, never markup
    expect(links[0]).toHaveAttribute("href", "/b/b1");
    expect(document.querySelectorAll("i")).toHaveLength(0);
  });

  it("says when no board uses it", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => answer({ usedIn: 0, boards: [] })));
    render(<UsedInBoards assetId={A} />);
    expect(await screen.findByText("Not used in any board")).toBeInTheDocument();
  });

  it("shows nothing when the server cannot say (offline, local-only, an asset not uploaded yet)", async () => {
    const f = vi.fn(async () => answer({ error: "local-only" }, 503));
    vi.stubGlobal("fetch", f);
    const { container } = render(<UsedInBoards assetId={A} />);
    await waitFor(() => expect(f).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
    const second = render(<UsedInBoards assetId={B} />);
    await new Promise((r) => setTimeout(r, 0));
    expect(second.container).toBeEmptyDOMElement();
  });

  it("asks once per asset while it is on screen", async () => {
    const f = vi.fn(async () => answer({ usedIn: 1, boards: [{ id: "b1", title: "One" }] }));
    vi.stubGlobal("fetch", f);
    const { rerender } = render(<UsedInBoards assetId={A} />);
    await screen.findByText("Used in 1 board");
    rerender(<UsedInBoards key={A} assetId={A} />);
    expect(f).toHaveBeenCalledTimes(1);
  });
});
