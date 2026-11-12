"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useEditor } from "@/components/editor/EditorContext";
import { getAssetResolver } from "@/lib/assets/resolver";
import { getExportManager } from "@/lib/engine/export/manager";
import { createRoundsClient } from "@/lib/engine/rounds/client";
import { roundsUi } from "@/lib/engine/rounds/ui-store";
import { useBoardInfo } from "./BoardInfo";
import { CompareChooser } from "./CompareChooser";
import { PublishDialog } from "./PublishDialog";
import { useRoundsSync } from "./useRoundsSync";

/** Renders what the rounds commands asked for (the Publish dialog, the Compare chooser). Mount once inside the editor. */
export function RoundsHost() {
  const request = useSyncExternalStore(roundsUi.subscribe, () => roundsUi.current, () => null);
  const info = useBoardInfo();
  const { handle, toast, panels, navigate } = useEditor();
  const client = useMemo(() => createRoundsClient(), []);
  const doc = handle.doc;

  const sync = useRoundsSync(info, doc);

  const close = useCallback(() => roundsUi.close(), []);

  if (!request || !info || !sync) return null;
  if (request.kind === "publish") {
    return (
      <PublishDialog
        boardId={info.boardId}
        doc={doc}
        client={client}
        sync={sync}
        exporter={getExportManager()}
        assets={getAssetResolver()}
        toast={toast}
        onClose={close}
        onOpenRounds={() => panels.open("rounds")}
      />
    );
  }
  return <CompareChooser boardId={info.boardId} client={client} navigate={navigate} onClose={close} />;
}
