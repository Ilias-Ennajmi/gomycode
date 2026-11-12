// The command that opens the Share dialog (the dialog does the work: links, new link, copy, QR, revoke).
import type { Command } from "@/lib/engine/commands/registry";

export const SHARE_COMMANDS: Command[] = [
  {
    id: "share.open",
    label: "Share…",
    group: "board",
    shortcut: "Mod+Shift+S",
    when: (c) => !!c.ui?.openShare,
    run: (c) => c.ui?.openShare?.(),
  },
];
