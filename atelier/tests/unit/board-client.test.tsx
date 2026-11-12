import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const openBoardSession = vi.fn();
vi.mock("@/lib/board/session", async (orig) => ({ ...(await orig<typeof import("@/lib/board/session")>()), openBoardSession: (o: unknown) => openBoardSession(o) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { BoardClient } from "@/app/b/[boardId]/board-client";

beforeEach(() => openBoardSession.mockReset());
afterEach(() => vi.restoreAllMocks());

describe("BoardClient", () => {
  it("shows a clear not-found page, not a crash, for a board the owner does not have", async () => {
    openBoardSession.mockResolvedValue({ status: "not-found" });
    render(<BoardClient boardId="00000000-0000-4000-8000-000000000001" localOnly={false} />);
    expect(screen.getByRole("status")).toHaveTextContent("Opening board…");
    expect(await screen.findByRole("heading", { name: "This board doesn't exist" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to your boards" })).toHaveAttribute("href", "/");
  });

  it("asks for the board with the local-only flag it was given", async () => {
    openBoardSession.mockResolvedValue({ status: "not-found" });
    render(<BoardClient boardId="b" localOnly />);
    await waitFor(() => expect(openBoardSession).toHaveBeenCalledWith(expect.objectContaining({ boardId: "b", localOnly: true })));
  });

  it("a session that arrives after leaving the page is disposed, not shown", async () => {
    const dispose = vi.fn(async () => {});
    let resolve!: (v: unknown) => void;
    openBoardSession.mockReturnValue(new Promise((r) => (resolve = r)));
    const { unmount } = render(<BoardClient boardId="b" localOnly={false} />);
    unmount();
    resolve({ status: "ready", board: { dispose } });
    await waitFor(() => expect(dispose).toHaveBeenCalled());
  });
});
