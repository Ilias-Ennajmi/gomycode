"use client";

import { Plus } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import * as Y from "yjs";
import { Dialog } from "@/components/home/Dialog";
import { buttonPrimary, buttonSecondary, helpClass } from "@/components/ui/controls";
import type { BoardDoc } from "@/lib/engine/doc/board-doc";
import type { ToastFn } from "@/lib/engine/commands/registry";
import { boardDocSource, framesInOrder } from "@/lib/engine/export/scene";
import type { ShareLinkSummary } from "@/lib/share/link";
import { createShareClient, LinksModel, type ShareClient } from "@/lib/share/share-client";
import { emptyForm, validateForm, type FormState, type RoundOption } from "@/lib/share/share-form";
import { CreatedLink } from "./CreatedLink";
import { LinkTable } from "./LinkTable";
import { NewLinkForm } from "./NewLinkForm";

type Props = {
  boardId: string;
  doc: BoardDoc;
  toast: ToastFn;
  /** Local-only mode: no account, links are kept by this server only (and the board's state is handed over to it). */
  localOnly?: boolean;
  onClose(): void;
  /** Tests inject these. */
  client?: ShareClient;
  now?: () => Date;
};

const realNow = (): Date => new Date();

type View = { kind: "links" } | { kind: "new" } | { kind: "created"; url: string; link: ShareLinkSummary };

/**
 * The Share dialog: the board's links (and what to do with them), and a form for a new one. A native modal <dialog> (focus
 * is trapped, Escape closes, focus returns to the Share button); a sheet that fills the width of a phone. The address of a new
 * link is shown once, in `CreatedLink`, and held only by that view.
 */
export function ShareDialog({ boardId, doc, toast, localOnly = false, onClose, client: injected, now = realNow }: Props) {
  const uid = useId();
  const client = useMemo(() => injected ?? createShareClient(), [injected]);
  const model = useMemo(() => new LinksModel(client, boardId, now), [client, boardId, now]);
  const list = useSyncExternalStore(model.subscribe, model.snapshot, model.snapshot);

  const frames = useMemo(() => framesInOrder(boardDocSource(doc)).map((f) => ({ id: f.id, name: f.name })), [doc]);
  const [rounds, setRounds] = useState<{ available: boolean; rounds: RoundOption[] } | null>(null);
  const [view, setView] = useState<View>({ kind: "links" });
  const [form, setForm] = useState<FormState>(() => emptyForm([]));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const alive = useRef(true);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstView = useRef(true);

  const handOver = useCallback(async () => {
    if (!localOnly) return;
    await client.handOverLocalState(boardId, Y.encodeStateAsUpdate(doc.ydoc), doc.meta.title);
  }, [client, boardId, doc, localOnly]);

  useEffect(() => {
    alive.current = true;
    void (async () => {
      await handOver();
      if (!alive.current) return;
      await model.load();
    })();
    void client.rounds(boardId).then((r) => {
      if (!alive.current) return;
      setRounds(r);
      setForm((f) => (f.mode === "live" && f.roundId === null && r.rounds.length > 0 ? emptyForm(r.rounds) : f));
    });
    return () => {
      alive.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per opening
  }, []);

  // When the view changes, move focus to its heading so a keyboard or screen-reader user lands on the new content.
  useEffect(() => {
    if (firstView.current) {
      firstView.current = false;
      return;
    }
    if (view.kind !== "created") headingRef.current?.focus();
  }, [view.kind]);

  const roundList = rounds?.rounds ?? [];
  const roundsAvailable = rounds?.available ?? false;

  async function create() {
    if (creating) return;
    const now0 = now();
    const checked = validateForm(form, { now: now0, rounds: roundList, frameIds: frames.map((f) => f.id) });
    if (!checked.ok) {
      setErrors(checked.errors);
      setFormError(null);
      queueMicrotask(() => document.querySelector<HTMLElement>("[data-share-form] [aria-invalid=true]")?.focus());
      return;
    }
    setErrors({});
    setFormError(null);
    setCreating(true);
    await handOver();
    const r = await client.create(boardId, checked.value);
    if (!alive.current) return;
    setCreating(false);
    if (!r.ok) {
      setErrors(r.fieldErrors ?? {});
      setFormError(r.message);
      return;
    }
    model.add(r.value.link);
    setView({ kind: "created", url: r.value.url, link: r.value.link });
  }

  async function revoke(id: string) {
    const name = list.links.find((l) => l.id === id)?.name ?? "link";
    const r = await model.revoke(id);
    if (!alive.current) return;
    if (r.ok) toast({ message: `Revoked ${name}. It no longer opens.`, durationMs: 4000 });
    else toast({ message: `Couldn't revoke ${name}. ${r.message}`, durationMs: 8000 });
  }

  async function remove(id: string) {
    const name = list.links.find((l) => l.id === id)?.name ?? "link";
    const r = await model.remove(id);
    if (!alive.current) return;
    headingRef.current?.focus();
    if (r.ok) toast({ message: `Deleted ${name}.`, durationMs: 4000 });
    else toast({ message: `Couldn't delete ${name}. ${r.message}`, durationMs: 8000 });
  }

  const startNew = () => {
    setForm(emptyForm(roundList));
    setErrors({});
    setFormError(null);
    setView({ kind: "new" });
  };

  const titleId = `${uid}-title`;
  const noteId = `${uid}-note`;
  const heading = view.kind === "new" ? "New link" : view.kind === "created" ? "Link created" : "Links";

  return (
    <Dialog
      labelledBy={titleId}
      describedBy={localOnly ? noteId : undefined}
      onClose={onClose}
      widthClass="w-[min(46rem,calc(100vw-1rem))] max-sm:mb-0 max-sm:max-h-[92dvh] max-sm:w-full max-sm:rounded-b-none"
    >
      <div data-share-dialog="">
        <h2 id={titleId} tabIndex={-1} data-autofocus="" className="mb-1 text-(length:--text-lg) font-semibold outline-none">
          Share this board
        </h2>
        {localOnly ? (
          <p id={noteId} role="note" className="mt-2 mb-1 rounded-md border border-line px-3 py-2 text-(length:--text-sm) text-fg-muted" data-local-note="">
            Local mode: links only work on this server. They won&apos;t open anywhere else.
          </p>
        ) : null}
        <h3 ref={headingRef} tabIndex={-1} className="mt-3 text-(length:--text-md) font-semibold text-fg-muted outline-none">
          {heading}
        </h3>


        {view.kind === "links" ? (
          <div className="mt-3">
            {list.status === "loading" || list.status === "idle" ? (
              <p className={helpClass} role="status">
                Loading links…
              </p>
            ) : list.status === "error" ? (
              <div role="alert" className="rounded-md border border-alert px-3 py-2 text-(length:--text-sm) text-alert">
                <p className="m-0">{list.error}</p>
                <button type="button" className={`${buttonSecondary} mt-2`} onClick={() => void model.load()}>
                  Try again
                </button>
              </div>
            ) : list.links.length === 0 ? (
              <div data-empty="" className="rounded-lg border border-dashed border-line px-4 py-8 text-center">
                <p className="m-0 text-(length:--text-md) font-medium">No links yet</p>
                <p className={helpClass}>Make a link to send your client a board they can review on any device, with no account.</p>
              </div>
            ) : (
              <LinkTable links={list.links} rounds={roundList} busy={list.busy} now={now()} onRevoke={(id) => void revoke(id)} onDelete={(id) => void remove(id)} />
            )}
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" className={buttonSecondary} onClick={onClose}>
                Close
              </button>
              <button type="button" className={buttonPrimary} onClick={startNew} disabled={list.status === "loading" || list.status === "idle" || rounds === null}>
                <Plus aria-hidden="true" size={16} />
                New link
              </button>
            </div>
          </div>
        ) : null}

        {view.kind === "new" ? (
          <div className="mt-4">
            <NewLinkForm
              value={form}
              onChange={setForm}
              frames={frames}
              rounds={roundList}
              roundsAvailable={roundsAvailable}
              errors={errors}
              formError={formError}
              busy={creating}
              onSubmit={() => void create()}
              onCancel={() => setView({ kind: "links" })}
            />
          </div>
        ) : null}

        {view.kind === "created" ? (
          <div className="mt-3">
            <CreatedLink url={view.url} name={view.link.name} toast={toast} onDone={() => setView({ kind: "links" })} onAnother={startNew} />
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
