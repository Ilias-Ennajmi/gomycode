// Registry commands for rounds and history. The dialogs and panels do the work; these only open them.
import type { Command } from "@/lib/engine/commands/registry";
import { roundsUi } from "./ui-store";

export const ROUND_COMMANDS: Command[] = [
  { id: "round.publish", label: "Publish round…", group: "board", run: () => roundsUi.open({ kind: "publish" }) },
  { id: "round.compare", label: "Compare rounds…", group: "board", run: () => roundsUi.open({ kind: "compare" }) },
  { id: "rounds.open", label: "Rounds", group: "board", when: (c) => !!c.ui?.togglePanel, run: (c) => c.ui?.togglePanel?.("rounds") },
  { id: "history.open", label: "Version history", group: "board", when: (c) => !!c.ui?.togglePanel, run: (c) => c.ui?.togglePanel?.("history") },
];
