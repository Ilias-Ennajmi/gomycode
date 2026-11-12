import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/" }));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

import { HomeApp } from "@/components/home/HomeApp";
import { createLocalInboxApi } from "@/lib/inbox/inbox-client";

beforeEach(() => {
  vi.unstubAllGlobals();
  indexedDB.deleteDatabase("atelier-inbox-local");
  indexedDB.deleteDatabase("atelier-inbox-queue");
});

describe("Home: Library and Inbox entries", () => {
  it("links to the Library and the Inbox", async () => {
    render(<HomeApp localOnly />);
    expect(await screen.findByRole("link", { name: "Library" })).toHaveAttribute("href", "/library");
    expect(screen.getByRole("link", { name: "Inbox" })).toHaveAttribute("href", "/inbox");
  });

  it("shows how many items wait in the Inbox (local-only: from this device)", async () => {
    const api = createLocalInboxApi();
    for (const t of ["a", "b", "c"]) await api.create({ kind: "text", assetId: null, url: null, text: t, title: null, sourceUrl: null, credit: null });
    render(<HomeApp localOnly />);
    const link = await screen.findByRole("link", { name: "Inbox, 3 waiting" });
    expect(link).toHaveTextContent("3");
  });

  it("shows how many wait on the server when signed in", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => (String(url).startsWith("/api/inbox") ? Response.json({ items: [], unplaced: 12 }) : Response.json({ boards: [], trash: [], folders: [] }))),
    );
    render(<HomeApp localOnly={false} />);
    expect(await screen.findByRole("link", { name: "Inbox, 12 waiting" })).toBeInTheDocument();
  });

  it("shows no badge when nothing waits, and caps a long count", async () => {
    render(<HomeApp localOnly />);
    const link = await screen.findByRole("link", { name: "Inbox" });
    expect(link).not.toHaveTextContent(/\d/);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => (String(url).startsWith("/api/inbox") ? Response.json({ items: [], unplaced: 150 }) : Response.json({ boards: [], trash: [], folders: [] }))),
    );
    render(<HomeApp localOnly={false} />);
    await waitFor(() => expect(screen.getByRole("link", { name: "Inbox, 150 waiting" })).toHaveTextContent("99+"));
  });
});
