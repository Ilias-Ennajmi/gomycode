import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

// The server action is not what is under test: it only has to be a function the form can call.
vi.mock("@/app/login/actions", () => ({
  signIn: vi.fn(async () => ({})),
}));

import { LoginForm } from "@/app/login/login-form";

describe("LoginForm", () => {
  it("has visible labels and the right autocomplete hints", () => {
    render(<LoginForm next="/" />);
    const email = screen.getByLabelText("Email");
    const password = screen.getByLabelText("Password");
    expect(email).toHaveAttribute("type", "email");
    expect(email).toHaveAttribute("autocomplete", "username");
    expect(password).toHaveAttribute("type", "password");
    expect(password).toHaveAttribute("autocomplete", "current-password");
  });

  it("does not block pasting into the password field", () => {
    render(<LoginForm next="/" />);
    const password = screen.getByLabelText("Password");
    expect(password).not.toHaveAttribute("onpaste");
    expect(password.getAttribute("onpaste")).toBeNull();
  });

  it("toggles password visibility with an accessible, labelled button", async () => {
    const user = userEvent.setup();
    render(<LoginForm next="/" />);
    const password = screen.getByLabelText("Password");
    const toggle = screen.getByRole("button", { name: "Show password" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await user.click(toggle);
    expect(password).toHaveAttribute("type", "text");
    const hide = screen.getByRole("button", { name: "Hide password" });
    expect(hide).toHaveAttribute("aria-pressed", "true");
    await user.click(hide);
    expect(password).toHaveAttribute("type", "password");
  });

  it("carries the destination in a hidden field", () => {
    const { container } = render(<LoginForm next="/b/abc" />);
    expect(container.querySelector('input[name="next"]')).toHaveValue("/b/abc");
  });

  it("ties an error to the password field with aria-describedby", () => {
    render(<LoginForm next="/" initialError="This account can't open Atelier." />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("This account can't open Atelier.");
    const password = screen.getByLabelText("Password");
    expect(password).toHaveAttribute("aria-invalid", "true");
    expect(password.getAttribute("aria-describedby")).toBe(alert.id);
  });

  it("shows no error markup when there is no error", () => {
    render(<LoginForm next="/" />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByLabelText("Password")).not.toHaveAttribute("aria-describedby");
  });
});
