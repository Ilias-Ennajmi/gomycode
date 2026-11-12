import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "@/app/page";

// Also proves the jsdom project, jest-dom matchers and fake-indexeddb are wired up.
describe("home placeholder (jsdom)", () => {
  it("shows the Atelier heading and both theme lockups", () => {
    const { container } = render(<Home />);
    expect(screen.getByRole("heading", { name: "Atelier" })).toBeInTheDocument();
    const srcs = [...container.querySelectorAll("img")].map((i) => i.getAttribute("src"));
    expect(srcs).toContain("/brand/atelier-lockup-light.svg");
    expect(srcs).toContain("/brand/atelier-lockup-dark.svg");
  });

  it("has IndexedDB available", () => {
    expect(typeof indexedDB.open).toBe("function");
  });
});
