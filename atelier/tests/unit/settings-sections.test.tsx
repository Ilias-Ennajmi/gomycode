import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const signOut = vi.fn(async () => {});
vi.mock("@/app/login/verify/actions", () => ({ signOut: () => signOut() }));

import { Account, Appearance, Navigation, Storage, formatBytes } from "@/app/settings/sections";
import { SETTINGS_KEY } from "@/lib/settings";
import { THEME_STORAGE_KEY } from "@/lib/theme";

function throwingStorage() {
  vi.stubGlobal("localStorage", {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
    removeItem() {
      throw new Error("blocked");
    },
  });
}

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("Appearance", () => {
  it("offers Light, Dark and System, with System selected by default", () => {
    render(<Appearance />);
    expect(screen.getByRole("heading", { name: "Appearance" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "System" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Light" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "Dark" })).not.toBeChecked();
  });

  it("shows the saved choice", async () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    render(<Appearance />);
    await waitFor(() => expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked());
  });

  it("choosing a theme saves it and applies it at once", async () => {
    const user = userEvent.setup();
    render(<Appearance />);
    await user.click(screen.getByRole("radio", { name: "Dark" }));
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    await user.click(screen.getByRole("radio", { name: "Light" }));
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("keeps working when storage throws: defaults show and a choice still applies for this visit", async () => {
    throwingStorage();
    const user = userEvent.setup();
    render(<Appearance />);
    expect(screen.getByRole("radio", { name: "System" })).toBeChecked();
    await user.click(screen.getByRole("radio", { name: "Dark" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();
  });
});

describe("Navigation", () => {
  it("shows the defaults when nothing is saved", () => {
    render(<Navigation />);
    expect(screen.getByRole("radio", { name: "Zoom" })).toBeChecked();
    const slider = screen.getByRole("slider", { name: /Zoom speed/ });
    expect(slider).toHaveAttribute("min", "0.5");
    expect(slider).toHaveAttribute("max", "2");
    expect(slider).toHaveValue("1");
    expect(screen.getByRole("checkbox", { name: /Lock wheel behaviour/ })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Snap to edges/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Pen draws, finger pans" })).not.toBeChecked();
  });

  it("loads saved settings (and repairs bad ones)", async () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ wheel: "pan", sensitivity: 9, locked: true, snap: false, penOnlyDraws: true }));
    render(<Navigation />);
    await waitFor(() => expect(screen.getByRole("radio", { name: "Pan" })).toBeChecked());
    expect(screen.getByRole("slider", { name: /Zoom speed/ })).toHaveValue("2"); // clamped
    expect(screen.getByRole("checkbox", { name: /Lock wheel behaviour/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Snap to edges/ })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Pen draws, finger pans" })).toBeChecked();
  });

  it("saves every change", async () => {
    const user = userEvent.setup();
    render(<Navigation />);
    await user.click(screen.getByRole("radio", { name: "Pan" }));
    await user.click(screen.getByRole("checkbox", { name: "Pen draws, finger pans" }));
    await user.click(screen.getByRole("checkbox", { name: /Snap to edges/ }));
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY)!);
    expect(saved).toMatchObject({ wheel: "pan", penOnlyDraws: true, snap: false, locked: false, sensitivity: 1 });
  });

  it("the slider changes the saved sensitivity and reads out its value", async () => {
    render(<Navigation />);
    const slider = screen.getByRole("slider", { name: /Zoom speed/ });
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.change(slider, { target: { value: "1.5" } });
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY)!).sensitivity).toBe(1.5);
    expect(screen.getByText("1.5×")).toBeInTheDocument();
  });

  it("defaults survive storage that throws, and changes still apply on screen", async () => {
    throwingStorage();
    const user = userEvent.setup();
    render(<Navigation />);
    expect(screen.getByRole("radio", { name: "Zoom" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Snap to edges/ })).toBeChecked();
    await user.click(screen.getByRole("checkbox", { name: /Snap to edges/ }));
    expect(screen.getByRole("checkbox", { name: /Snap to edges/ })).not.toBeChecked();
  });
});

describe("formatBytes", () => {
  it("reads like a file manager", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1023)).toBe("1023 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatBytes(12.34 * 1024 ** 3)).toBe("12.3 GB");
    expect(formatBytes(Number.NaN)).toBe("0 B");
  });
});

describe("Storage", () => {
  function mockStorage(over: Partial<{ usage: number; quota: number; persisted: boolean; persist: () => Promise<boolean> }> = {}) {
    const storage = {
      estimate: vi.fn(async () => ({ usage: over.usage ?? 48 * 1024 * 1024, quota: over.quota ?? 2 * 1024 ** 3 })),
      persisted: vi.fn(async () => over.persisted ?? false),
      persist: vi.fn(over.persist ?? (async () => true)),
    };
    vi.stubGlobal("navigator", { ...navigator, storage });
    return storage;
  }

  it("shows usage against the quota and whether it is protected", async () => {
    mockStorage();
    render(<Storage localOnly={false} />);
    expect(await screen.findByText(/48\.0 MB of 2\.0 GB/)).toBeInTheDocument();
    expect(screen.getByText(/not protected/i)).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Storage used" })).toBeInTheDocument();
  });

  it("'Keep my data on this device' asks the browser to persist and reports the answer", async () => {
    const user = userEvent.setup();
    const s = mockStorage();
    render(<Storage localOnly={false} />);
    await user.click(await screen.findByRole("button", { name: "Keep my data on this device" }));
    expect(s.persist).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/protected/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Keep my data on this device" })).toBeNull();
  });

  it("explains a refusal instead of failing silently", async () => {
    const user = userEvent.setup();
    mockStorage({ persist: async () => false });
    render(<Storage localOnly={false} />);
    await user.click(await screen.findByRole("button", { name: "Keep my data on this device" }));
    expect(await screen.findByText(/didn't allow/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Keep my data on this device" })).toBeInTheDocument();
  });

  it("already protected: says so and offers no button", async () => {
    mockStorage({ persisted: true });
    render(<Storage localOnly={false} />);
    expect(await screen.findByText(/Protected/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Keep my data on this device" })).toBeNull();
  });

  it("copes with a browser that cannot report storage, or with a persist() that throws", async () => {
    vi.stubGlobal("navigator", { ...navigator, storage: undefined });
    const { unmount } = render(<Storage localOnly={false} />);
    expect(await screen.findByText(/can't report/i)).toBeInTheDocument();
    unmount();
    const user = userEvent.setup();
    mockStorage({
      persist: async () => {
        throw new Error("nope");
      },
    });
    render(<Storage localOnly={false} />);
    await user.click(await screen.findByRole("button", { name: "Keep my data on this device" }));
    expect(await screen.findByText(/didn't allow/i)).toBeInTheDocument();
  });

  it("in local-only mode warns that nothing is kept on a server", async () => {
    mockStorage();
    render(<Storage localOnly />);
    expect(await screen.findByText(/only copy/i)).toBeInTheDocument();
  });
});

describe("Account", () => {
  it("signs out after clearing the private caches", async () => {
    const user = userEvent.setup();
    const deleted: string[] = [];
    vi.stubGlobal("caches", {
      keys: async () => ["atelier-shell-v1", "atelier-pages-v1", "atelier-static-v1", "atelier-images", "other"],
      delete: async (n: string) => (deleted.push(n), true),
    });
    render(<Account localOnly={false} />);
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    expect(deleted.sort()).toEqual(["atelier-images", "atelier-pages-v1"]);
  });

  it("still signs out when the Cache API is unavailable", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("caches", undefined);
    render(<Account localOnly={false} />);
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
  });

  it("local-only mode has no account to sign out of", () => {
    render(<Account localOnly />);
    const section = screen.getByRole("heading", { name: "Account" }).closest("section")!;
    expect(within(section).queryByRole("button", { name: "Sign out" })).toBeNull();
    expect(within(section).getByText(/local-only/i)).toBeInTheDocument();
  });
});
