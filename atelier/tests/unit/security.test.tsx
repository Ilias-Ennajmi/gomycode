import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));
vi.mock("qrcode", () => ({
  default: { toString: vi.fn(async () => "<svg xmlns='http://www.w3.org/2000/svg'></svg>") },
}));

const mfa = {
  listFactors: vi.fn(),
  enroll: vi.fn(),
  challengeAndVerify: vi.fn(),
  unenroll: vi.fn(),
};
const client = { auth: { mfa, refreshSession: vi.fn(async () => ({ data: {}, error: null })) } };
vi.mock("@/lib/supabase/client", () => ({ createBrowserClient: () => client }));

import { Security } from "@/app/settings/security";

beforeEach(() => {
  vi.clearAllMocks();
  mfa.listFactors.mockResolvedValue({ data: { all: [], totp: [] }, error: null });
  mfa.enroll.mockResolvedValue({
    data: { id: "f-new", type: "totp", totp: { uri: "otpauth://totp/Atelier:me?secret=ABCDEFGHIJKLMNOP", secret: "ABCDEFGHIJKLMNOP", qr_code: "" } },
    error: null,
  });
  mfa.challengeAndVerify.mockResolvedValue({ data: {}, error: null });
  mfa.unenroll.mockResolvedValue({ data: { id: "f1" }, error: null });
});

describe("Security settings", () => {
  it("offers to turn on two-step verification when there is no factor", () => {
    render(<Security initialFactors={[]} />);
    expect(screen.getByRole("heading", { name: "Security" })).toBeInTheDocument();
    expect(screen.getByText(/off/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set up two-step verification" })).toBeInTheDocument();
  });

  it("enrols: shows the QR code and key, then verifies a 6-digit code", async () => {
    const user = userEvent.setup();
    render(<Security initialFactors={[]} />);
    await user.click(screen.getByRole("button", { name: "Set up two-step verification" }));

    expect(mfa.enroll).toHaveBeenCalledWith(expect.objectContaining({ factorType: "totp" }));
    expect(await screen.findByRole("img", { name: /qr code/i })).toBeInTheDocument();
    expect(screen.getByText("ABCD EFGH IJKL MNOP")).toBeInTheDocument();

    const code = screen.getByLabelText("6-digit code");
    expect(code).toHaveAttribute("inputmode", "numeric");
    expect(code).toHaveAttribute("autocomplete", "one-time-code");

    await user.type(code, "123456");
    await user.click(screen.getByRole("button", { name: "Turn on" }));

    expect(mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: "f-new", code: "123456" });
    expect(await screen.findByText("Two-step verification is on.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove two-step verification" })).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  it("clears a half-finished earlier enrolment before starting a new one", async () => {
    mfa.listFactors.mockResolvedValue({
      data: { all: [{ id: "stale", factor_type: "totp", status: "unverified" }], totp: [] },
      error: null,
    });
    const user = userEvent.setup();
    render(<Security initialFactors={[]} />);
    await user.click(screen.getByRole("button", { name: "Set up two-step verification" }));
    await screen.findByRole("img", { name: /qr code/i });
    expect(mfa.unenroll).toHaveBeenCalledWith({ factorId: "stale" });
  });

  it("shows an error tied to the code field when the code is wrong", async () => {
    mfa.challengeAndVerify.mockResolvedValue({ data: null, error: { message: "Invalid TOTP code entered" } });
    const user = userEvent.setup();
    render(<Security initialFactors={[]} />);
    await user.click(screen.getByRole("button", { name: "Set up two-step verification" }));
    await user.type(await screen.findByLabelText("6-digit code"), "000000");
    await user.click(screen.getByRole("button", { name: "Turn on" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/didn't work/i);
    expect(screen.getByLabelText("6-digit code").getAttribute("aria-describedby")).toContain(alert.id);
  });

  it("rejects a code that is not 6 digits without calling Supabase", async () => {
    const user = userEvent.setup();
    render(<Security initialFactors={[]} />);
    await user.click(screen.getByRole("button", { name: "Set up two-step verification" }));
    await user.type(await screen.findByLabelText("6-digit code"), "12");
    await user.click(screen.getByRole("button", { name: "Turn on" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/6 digits/i);
    expect(mfa.challengeAndVerify).not.toHaveBeenCalled();
  });

  it("cancelling an enrolment removes the unfinished factor", async () => {
    const user = userEvent.setup();
    render(<Security initialFactors={[]} />);
    await user.click(screen.getByRole("button", { name: "Set up two-step verification" }));
    await screen.findByRole("img", { name: /qr code/i });
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(mfa.unenroll).toHaveBeenCalledWith({ factorId: "f-new" });
    expect(screen.getByRole("button", { name: "Set up two-step verification" })).toBeInTheDocument();
  });

  it("removing a factor needs a confirmation", async () => {
    const user = userEvent.setup();
    render(<Security initialFactors={[{ id: "f1", name: "Authenticator app" }]} />);
    expect(screen.getByText(/is on/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove two-step verification" }));
    expect(mfa.unenroll).not.toHaveBeenCalled();
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveAccessibleName(/remove two-step verification\?/i);

    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(mfa.unenroll).toHaveBeenCalledWith({ factorId: "f1" });
    expect(await screen.findByText("Two-step verification is off.")).toBeInTheDocument();
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("keeping the factor when the confirmation is dismissed", async () => {
    const user = userEvent.setup();
    render(<Security initialFactors={[{ id: "f1", name: "Authenticator app" }]} />);
    await user.click(screen.getByRole("button", { name: "Remove two-step verification" }));
    await user.click(screen.getByRole("button", { name: "Keep it on" }));
    expect(mfa.unenroll).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});
