"use client";

import { Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { helpClass } from "@/components/ui/controls";
import { describeLink, type RoundOption } from "@/lib/share/share-form";
import type { ShareLinkSummary } from "@/lib/share/link";

type Props = {
  links: readonly ShareLinkSummary[];
  rounds: readonly RoundOption[];
  busy: readonly string[];
  now: Date;
  onRevoke(id: string): void;
  onDelete(id: string): void;
};

type Pending = { id: string; kind: "revoke" | "delete" } | null;

const cellBase = "px-3 py-2 align-top max-sm:px-0 max-sm:py-1";
/** On a phone each cell is a "label: value" line (the label comes from data-label). */
const cell = `${cellBase} max-sm:flex max-sm:items-baseline max-sm:justify-between max-sm:gap-3 max-sm:before:text-(length:--text-sm) max-sm:before:text-fg-muted max-sm:before:content-[attr(data-label)]`;
const action =
  "inline-flex min-h-11 whitespace-nowrap items-center justify-center gap-1.5 rounded-md border border-line bg-panel px-3 text-(length:--text-sm) font-medium text-fg transition-[transform,border-color] duration-(--dur-fast) ease-out active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 hoverable:border-fg-muted";

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const when = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? dateFmt.format(new Date(t)) : "";
};

/**
 * The links of the board: name, when made, what a visitor may do, which version, expiry and state. A link can't be copied after
 * it was made (only a fingerprint of it is stored), so the only actions are Revoke (stops it at once) and Delete (removes it
 * and what visitors left on it). Both ask first, in the row, and keep keyboard focus where it was. A table on a wide screen;
 * each row becomes a card on a phone.
 */
export function LinkTable({ links, rounds, busy, now, onRevoke, onDelete }: Props) {
  const [pending, setPending] = useState<Pending>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const openers = useRef(new Map<string, HTMLButtonElement | null>());

  useEffect(() => {
    if (pending) confirmRef.current?.focus();
  }, [pending]);

  const cancel = () => {
    const p = pending;
    setPending(null);
    if (p) queueMicrotask(() => openers.current.get(`${p.id}:${p.kind}`)?.focus());
  };

  return (
    <div data-link-table="">
      <table className="w-full border-collapse text-left text-(length:--text-sm) max-sm:block">
        <caption className="sr-only">Share links for this board</caption>
        <thead className="max-sm:sr-only">
          <tr className="border-b border-line text-fg-muted">
            <th scope="col" className="px-3 py-2 font-medium">Link</th>
            <th scope="col" className="px-3 py-2 font-medium">Version</th>
            <th scope="col" className="px-3 py-2 font-medium">Can</th>
            <th scope="col" className="px-3 py-2 font-medium">Expiry</th>
            <th scope="col" className="px-3 py-2 font-medium">State</th>
            <th scope="col" className="px-3 py-2 font-medium">Views</th>
            <th scope="col" className="px-3 py-2 font-medium"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody className="max-sm:block">
          {links.map((l) => {
            const d = describeLink(l, rounds, now);
            const isBusy = busy.includes(l.id);
            const confirming = pending?.id === l.id ? pending.kind : null;
            return (
              <tr key={l.id} data-link-row={l.id} data-state={d.state.toLowerCase()} aria-busy={isBusy || undefined} className="border-b border-line max-sm:mb-3 max-sm:block max-sm:rounded-lg max-sm:border max-sm:p-3">
                <th scope="row" className={`${cellBase} text-left font-medium`}>
                  <span className="block break-words text-(length:--text-md)">{d.name}</span>
                  <span className="block text-fg-muted font-normal">
                    Made {when(l.createdAt)} · {d.scope}
                  </span>
                  {d.extras.length ? <span className="block text-fg-muted font-normal">{d.extras.join(" · ")}</span> : null}
                </th>
                <td data-label="Version" className={cell}>{d.mode}</td>
                <td data-label="Can" className={cell}>{d.permission}</td>
                <td data-label="Expiry" className={cell}>{d.expiry}</td>
                <td data-label="State" className={cell}>
                  <span data-status={d.state.toLowerCase()} className={`inline-flex items-center rounded-full border px-2 py-0.5 font-medium ${d.state === "Active" ? "border-line text-fg" : "border-alert text-alert"}`}>
                    {d.state}
                  </span>
                </td>
                <td data-label="Views" className={`${cell} text-fg-muted`} title="Views are counted once clients open the link">
                  <span aria-label="Views not counted yet">—</span>
                </td>
                <td className={`${cellBase} max-sm:pt-2`}>
                  {confirming ? (
                    <div role="group" aria-label={confirming === "revoke" ? `Confirm revoking ${d.name}` : `Confirm deleting ${d.name}`} className="flex flex-col gap-2">
                      <p className="m-0 max-w-56 text-(length:--text-sm)">
                        {confirming === "revoke" ? "Revoke this link? It stops working right away for everyone who has it." : "Delete this link and the reactions and comments visitors left on it?"}
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          ref={confirmRef}
                          className={`${action} border-alert text-alert`}
                          onClick={() => {
                            const p = pending!;
                            setPending(null);
                            if (p.kind === "revoke") onRevoke(p.id);
                            else onDelete(p.id);
                          }}
                        >
                          {confirming === "revoke" ? "Revoke link" : "Delete link"}
                        </button>
                        <button type="button" className={action} onClick={cancel}>
                          Keep it
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {d.canRevoke ? (
                        <button
                          type="button"
                          ref={(el) => void openers.current.set(`${l.id}:revoke`, el)}
                          className={action}
                          disabled={isBusy}
                          aria-label={`Revoke link ${d.name}`}
                          onClick={() => setPending({ id: l.id, kind: "revoke" })}
                        >
                          Revoke
                        </button>
                      ) : null}
                      <button
                        type="button"
                        ref={(el) => void openers.current.set(`${l.id}:delete`, el)}
                        className={action}
                        disabled={isBusy}
                        aria-label={`Delete link ${d.name}`}
                        onClick={() => setPending({ id: l.id, kind: "delete" })}
                      >
                        <Trash2 aria-hidden="true" size={14} />
                        Delete
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className={`${helpClass} mt-3`} data-no-copy-note="">
        A link can&apos;t be copied again after you create it: Atelier keeps only a fingerprint of it, not the address. To share it again, create a new link and revoke the old one.
      </p>
    </div>
  );
}

