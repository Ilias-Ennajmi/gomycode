process.env.TZ = "UTC";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CompareChooser } from "@/components/rounds/CompareChooser";
import { RoundsRequestError, type HistoryVersion, type RoundsClient } from "@/lib/engine/rounds/client";

const v = (over: Partial<HistoryVersion>): HistoryVersion => ({ id: "x", kind: "compaction", label: null, roundNumber: null, createdAt: "2026-11-10T12:30:00Z", uptoSeq: 1, ...over });
const client = (listHistory: RoundsClient["listHistory"]) => ({ listHistory }) as Pick<RoundsClient, "listHistory">;
const versions = [v({ id: "r2", kind: "round", roundNumber: 2, label: "Direction B", createdAt: "2026-11-10T12:30:00Z" }), v({ id: "c1", createdAt: "2026-11-09T12:00:00Z", label: "Before restore" }), v({ id: "r1", kind: "round", roundNumber: 1, label: "Round 1", createdAt: "2026-11-05T12:00:00Z" })];

describe("CompareChooser", () => {
  it("offers every version for A and the current board plus every version for B, and starts on latest round vs current", async () => {
    render(<CompareChooser boardId="b1" client={client(async () => versions)} navigate={() => {}} onClose={() => {}} />);
    const dialog = await screen.findByRole("dialog", { name: /compare/i });
    const a = (await within(dialog).findByLabelText(/^A /)) as HTMLSelectElement;
    const b = within(dialog).getByLabelText(/^B /) as HTMLSelectElement;
    expect(within(a).getAllByRole("option").map((o) => o.textContent)).toEqual(["Round 2 · Direction B", "9 Nov, 12:00 · Before restore", "Round 1"]);
    expect(within(b).getAllByRole("option").map((o) => o.textContent)).toEqual(["Current board", "Round 2 · Direction B", "9 Nov, 12:00 · Before restore", "Round 1"]);
    expect(a.value).toBe("r2");
    expect(b.value).toBe("current");
  });

  it("Compare goes to the compare page with the chosen pair", async () => {
    const navigate = vi.fn();
    const onClose = vi.fn();
    render(<CompareChooser boardId="b1" client={client(async () => versions)} navigate={navigate} onClose={onClose} />);
    const a = (await screen.findByLabelText(/^A /)) as HTMLSelectElement;
    fireEvent.change(a, { target: { value: "r1" } });
    fireEvent.change(screen.getByLabelText(/^B /), { target: { value: "r2" } });
    fireEvent.click(screen.getByRole("button", { name: /^compare$/i }));
    expect(navigate).toHaveBeenCalledWith("/b/b1/compare?a=r1&b=r2");
    expect(onClose).toHaveBeenCalled();
  });

  it("will not compare a version with itself", async () => {
    render(<CompareChooser boardId="b1" client={client(async () => versions)} navigate={() => {}} onClose={() => {}} />);
    const a = (await screen.findByLabelText(/^A /)) as HTMLSelectElement;
    fireEvent.change(screen.getByLabelText(/^B /), { target: { value: "r2" } });
    expect(a.value).toBe("r2");
    expect(screen.getByRole("button", { name: /^compare$/i })).toBeDisabled();
    expect(screen.getByText(/pick two different/i)).toBeInTheDocument();
  });

  it("with nothing to compare, says so", async () => {
    render(<CompareChooser boardId="b1" client={client(async () => [])} navigate={() => {}} onClose={() => {}} />);
    expect(await screen.findByText(/nothing to compare yet/i)).toBeInTheDocument();
  });

  it("without the server, says so", async () => {
    render(<CompareChooser boardId="b1" client={client(async () => { throw new RoundsRequestError(503, "not-configured"); })} navigate={() => {}} onClose={() => {}} />);
    expect(await screen.findByText(/needs the server/i)).toBeInTheDocument();
  });

  it("Cancel closes", async () => {
    const onClose = vi.fn();
    render(<CompareChooser boardId="b1" client={client(async () => versions)} navigate={() => {}} onClose={onClose} />);
    await waitFor(() => screen.getByLabelText(/^A /));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
