"use client";

import { useEffect, useId, useState } from "react";
import { Dialog } from "@/components/home/Dialog";
import { buttonPrimary, buttonSecondary, helpClass, inputClass, labelClass } from "@/components/ui/controls";
import type { HistoryVersion, RoundsClient } from "@/lib/engine/rounds/client";
import { versionLabel } from "./CompareClient";

type Load = { phase: "loading" } | { phase: "needs-server" } | { phase: "error" } | { phase: "ready"; versions: HistoryVersion[] };

/** "Compare rounds…": pick two versions (or one and the board as it is now), then open the compare page. */
export function CompareChooser({ boardId, client, navigate, onClose }: { boardId: string; client: Pick<RoundsClient, "listHistory">; navigate(href: string): void; onClose(): void }) {
  const uid = useId();
  const [load, setLoad] = useState<Load>({ phase: "loading" });
  const [a, setA] = useState("");
  const [b, setB] = useState("current");

  useEffect(() => {
    let cancelled = false;
    void client.listHistory(boardId).then(
      (versions) => {
        if (cancelled) return;
        setLoad({ phase: "ready", versions });
        // Latest round (else the latest version) against the board as it is now.
        const first = versions.find((v) => v.kind === "round") ?? versions[0];
        if (first) setA(first.id);
      },
      (e: unknown) => {
        if (cancelled) return;
        const status = (e as { status?: number } | null)?.status;
        setLoad(status === 503 || status === 401 || status === 403 ? { phase: "needs-server" } : { phase: "error" });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [boardId, client]);

  const titleId = `${uid}-title`;
  const versions = load.phase === "ready" ? load.versions : [];
  const same = a !== "" && a === b;
  const go = () => {
    if (!a || same) return;
    navigate(`/b/${encodeURIComponent(boardId)}/compare?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`);
    onClose();
  };

  return (
    <Dialog labelledBy={titleId} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go();
        }}
      >
        <h2 id={titleId} className="mb-4 text-(length:--text-lg) font-semibold">
          Compare rounds
        </h2>
        {load.phase === "loading" ? (
          <p role="status" className="text-(length:--text-sm) text-fg-muted">
            Loading versions…
          </p>
        ) : load.phase === "needs-server" ? (
          <p className="text-(length:--text-sm)">Comparing needs the server, and it isn&rsquo;t available right now.</p>
        ) : load.phase === "error" ? (
          <p role="alert" className="text-(length:--text-sm) text-alert">
            Couldn&rsquo;t load the versions.
          </p>
        ) : versions.length === 0 ? (
          <p className="text-(length:--text-sm)">Nothing to compare yet. Publish a round first, then compare it with the board.</p>
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              <label htmlFor={`${uid}-a`} className={labelClass}>
                A (before)
              </label>
              <select id={`${uid}-a`} className={inputClass} value={a} onChange={(e) => setA(e.target.value)} data-autofocus="">
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {versionLabel(v, "Version")}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`${uid}-b`} className={labelClass}>
                B (after)
              </label>
              <select id={`${uid}-b`} className={inputClass} value={b} onChange={(e) => setB(e.target.value)}>
                <option value="current">Current board</option>
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {versionLabel(v, "Version")}
                  </option>
                ))}
              </select>
              {same ? <p className={helpClass}>Pick two different versions to compare.</p> : null}
            </div>
          </div>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className={buttonSecondary} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={buttonPrimary} disabled={load.phase !== "ready" || versions.length === 0 || !a || same}>
            Compare
          </button>
        </div>
      </form>
    </Dialog>
  );
}
