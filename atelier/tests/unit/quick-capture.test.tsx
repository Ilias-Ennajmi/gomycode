import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CaptureForm, QuickCapture } from "@/components/chrome/QuickCapture";
import type { NewInboxItem } from "@/lib/inbox/types";

const A = "6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e01";
function setup() {
  const added: NewInboxItem[] = [];
  const client = { add: vi.fn(async (i: NewInboxItem) => void added.push(i)) };
  const uploader = { addAssetOnly: vi.fn(async () => A) };
  return { added, client, uploader };
}
const png = (name = "a.png") => new File([new Uint8Array(8)], name, { type: "image/png" });

describe("CaptureForm", () => {
  it("Enter in the field adds a link and clears the field", async () => {
    const { added, client, uploader } = setup();
    render(<CaptureForm client={client} uploader={uploader} />);
    const field = screen.getByLabelText("Link or note");
    await userEvent.type(field, "https://example.com/a{Enter}");
    await waitFor(() => expect(added).toHaveLength(1));
    expect(added[0]).toMatchObject({ kind: "url", url: "https://example.com/a" });
    expect(field).toHaveValue("");
    expect(screen.getByRole("status")).toHaveTextContent(/Added/);
  });

  it("Shift+Enter makes a new line instead of submitting, and the text becomes a note", async () => {
    const { added, client, uploader } = setup();
    render(<CaptureForm client={client} uploader={uploader} />);
    const field = screen.getByLabelText("Link or note");
    await userEvent.type(field, "line one{Shift>}{Enter}{/Shift}line two");
    expect(added).toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: "Add to Inbox" }));
    await waitFor(() => expect(added).toHaveLength(1));
    expect(added[0]).toMatchObject({ kind: "text", text: "line one\nline two" });
  });

  it("pasting a file adds it as a picture", async () => {
    const { added, client, uploader } = setup();
    const { container } = render(<CaptureForm client={client} uploader={uploader} />);
    fireEvent.paste(container.firstElementChild!, { clipboardData: { files: [png("shot.png")], getData: () => "", types: ["Files"] } });
    await waitFor(() => expect(added).toHaveLength(1));
    expect(added[0]).toMatchObject({ kind: "image", assetId: A, title: "shot.png" });
  });

  it("picking files with the button adds them", async () => {
    const { added, client, uploader } = setup();
    render(<CaptureForm client={client} uploader={uploader} />);
    const input = screen.getByTestId("capture-file-input") as HTMLInputElement;
    await userEvent.upload(input, [png("one.png"), png("two.png")]);
    await waitFor(() => expect(added).toHaveLength(2));
  });

  it("dropping files on the form adds them", async () => {
    const { added, client, uploader } = setup();
    const { container } = render(<CaptureForm client={client} uploader={uploader} />);
    fireEvent.drop(container.firstElementChild!, { dataTransfer: { files: [png("dropped.png")], types: ["Files"] } });
    await waitFor(() => expect(added).toHaveLength(1));
  });

  it("names a refused file in an alert and keeps working", async () => {
    const { added, client, uploader } = setup();
    render(<CaptureForm client={client} uploader={uploader} />);
    await userEvent.upload(screen.getByTestId("capture-file-input"), [new File([new Uint8Array(8)], "logo.svg", { type: "image/svg+xml" })], { applyAccept: false });
    expect(await screen.findByRole("alert")).toHaveTextContent("logo.svg");
    expect(added).toHaveLength(0);
  });

  it("says when there is nothing to add, and renders what was typed as plain text only", async () => {
    const { client, uploader } = setup();
    render(<CaptureForm client={client} uploader={uploader} />);
    await userEvent.click(screen.getByRole("button", { name: "Add to Inbox" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("nothing to add");
  });
});

describe("QuickCapture dialog", () => {
  function Host({ client, uploader }: ReturnType<typeof setup>) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button onClick={() => setOpen(true)}>Capture</button>
        {open ? <QuickCapture client={client} uploader={uploader} onClose={() => setOpen(false)} /> : null}
      </>
    );
  }

  it("opens as a dialog, closes after an item is added, and gives focus back to the trigger", async () => {
    const s = setup();
    render(<Host {...s} />);
    const trigger = screen.getByRole("button", { name: "Capture" });
    trigger.focus();
    await userEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "Quick capture" });
    expect(dialog).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Link or note"), "a thought{Enter}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(s.added).toHaveLength(1);
    expect(trigger).toHaveFocus();
  });

  it("Escape closes it without adding anything and returns focus", async () => {
    const s = setup();
    render(<Host {...s} />);
    const trigger = screen.getByRole("button", { name: "Capture" });
    await userEvent.click(trigger);
    await screen.findByRole("dialog");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(s.added).toHaveLength(0);
    expect(trigger).toHaveFocus();
  });
});
