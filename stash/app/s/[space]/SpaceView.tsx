"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ChevronLeft, Pencil, Play } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Segmented } from "@/components/ui/Segmented";
import { Sheet } from "@/components/ui/Sheet";
import { Skeleton } from "@/components/ui/Skeleton";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { cx } from "@/components/ui/cx";
import { SPACE_BG, SPACE_COLORS, SPACE_LABEL, SPACE_TEXT, SPACE_TINT, type SpaceColor } from "@/components/ui/space";
import { SaveGrid } from "@/components/library/SaveGrid";
import { useAppearance } from "@/components/theme/ThemeProvider";
import { useLibrary } from "@/lib/hooks/useLibrary";
import { archiveSpace, updateSpace } from "@/lib/data";
import { filterSaves } from "@/lib/queue";

export function SpaceView({ id }: { id: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const { appearance } = useAppearance();
  const lib = useLibrary();
  const [editOpen, setEditOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState<SpaceColor>("violet");
  const [kind, setKind] = useState<"topic" | "project">("topic");

  const space = lib.spaces.find((s) => s.id === id);
  const inboxId = lib.spaces.find((s) => s.kind === "inbox")?.id ?? null;
  const spacesById = useMemo(() => new Map(lib.spaces.map((s) => [s.id, s])), [lib.spaces]);
  const items = useMemo(() => {
    const all = filterSaves(lib.saves, { space: id === inboxId ? "inbox" : id, filter: "all", inboxId });
    // Applied first, then newest.
    return [...all].sort((a, b) => Number(Boolean(b.appliedAt)) - Number(Boolean(a.appliedAt)));
  }, [lib.saves, id, inboxId]);
  const watched = items.filter((s) => s.watchedAt).length;
  const applied = items.filter((s) => s.appliedAt).length;
  const unwatched = items.filter((s) => !s.watchedAt && s.status !== "queued" && s.status !== "processing").length;

  if (!space) {
    return (
      <main className="mx-auto min-h-dvh max-w-xl p-4 pt-safe">
        {lib.loading ? (
          <div className="flex flex-col gap-3">
            <Skeleton shape="line" className="w-1/2" />
            <Skeleton shape="block" />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <p className="text-body text-fg-muted">This Space isn&apos;t here anymore.</p>
            <Button variant="secondary" onClick={() => router.replace("/library")}>
              Back to Library
            </Button>
          </div>
        )}
      </main>
    );
  }

  const openEdit = () => {
    setName(space.name);
    setColor(space.color);
    setKind(space.kind === "project" ? "project" : "topic");
    setEditOpen(true);
  };

  const saveEdit = async () => {
    const values = { name: name.trim() || space.name, color_token: color, kind };
    lib.setSpaces((prev) => prev.map((s) => (s.id === space.id ? { ...s, name: values.name, color, kind } : s)));
    setEditOpen(false);
    try {
      await updateSpace(space.id, values);
    } catch {
      toast({ message: "Couldn't save the change. Check your connection." });
      void lib.refresh();
    }
  };

  const archive = async () => {
    setEditOpen(false);
    try {
      await archiveSpace(space.id);
      toast({ message: `${space.name} archived. Its saves stay in the Library.` });
      router.replace("/library");
    } catch {
      toast({ message: "Couldn't archive it. Check your connection." });
    }
  };

  const isInbox = space.kind === "inbox";

  return (
    <main className="mx-auto min-h-dvh max-w-xl pb-safe">
      <header className="flex items-center justify-between px-2 pt-safe">
        <IconButton
          label="Back"
          icon={ChevronLeft}
          onClick={() => (window.history.length > 1 ? router.back() : router.replace("/library"))}
        />
        {!isInbox && <IconButton label="Edit Space" icon={Pencil} onClick={openEdit} />}
      </header>

      <section className="flex flex-col gap-4 px-4 pb-4">
        <span className={cx("inline-flex h-8 items-center gap-2 self-start rounded-full px-3 text-label", SPACE_TINT[space.color], SPACE_TEXT[space.color])}>
          <span aria-hidden className={cx("h-2 w-2 rounded-full", SPACE_BG[space.color])} />
          {isInbox ? "Inbox" : space.kind === "project" ? `Project${space.dueDate ? ` · due ${new Date(space.dueDate).toLocaleDateString(undefined, { day: "numeric", month: "short" })}` : ""}` : "Topic"}
        </span>
        <h1 className="text-display">{space.name}</h1>
        {space.description && <p className="text-body text-fg-muted">{space.description}</p>}

        <dl className="grid grid-cols-3 gap-2">
          {[
            ["saved", items.length],
            ["watched", watched],
            ["applied", applied],
          ].map(([label, value]) => (
            <div key={label} className="rounded-card border border-line bg-surface p-3">
              <dd className="text-title">{value}</dd>
              <dt className="text-caption text-fg-muted">{label}</dt>
            </div>
          ))}
        </dl>

        {unwatched > 0 && (
          <Link
            href={`/play?space=${isInbox ? "inbox" : space.id}&filter=unwatched`}
            className="flex h-14 items-center justify-center gap-2 rounded-card bg-accent text-label text-on-accent active:scale-95"
          >
            <Play size={24} strokeWidth={2} fill="currentColor" aria-hidden />
            Play {unwatched} unwatched
          </Link>
        )}
      </section>

      {items.length === 0 ? (
        <p className="px-6 py-12 text-center text-body text-fg-muted">
          Nothing here yet. Pick this Space when you save, or move saves here from the Library.
        </p>
      ) : (
        <SaveGrid
          items={items}
          thumbs={lib.thumbs}
          spacesById={spacesById}
          justReady={lib.justReady}
          density={appearance.density}
          onOpen={(s) => router.push(`/item/${s.id}`)}
        />
      )}

      <Sheet open={editOpen} onClose={() => setEditOpen(false)} label="Edit Space" title="Edit Space">
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            void saveEdit();
          }}
        >
          <TextField label="Name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          <Segmented
            label="Kind"
            options={[
              { value: "topic", label: "Topic" },
              { value: "project", label: "Project" },
            ]}
            value={kind}
            onChange={(v) => setKind(v as "topic" | "project")}
          />
          <fieldset className="flex flex-col gap-2">
            <legend className="text-label text-fg">Colour</legend>
            <div className="flex flex-wrap gap-2">
              {SPACE_COLORS.filter((c) => c !== "inbox").map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={SPACE_LABEL[c]}
                  aria-pressed={color === c}
                  onClick={() => setColor(c)}
                  className={cx("h-12 w-12 rounded-full", SPACE_BG[c], color === c && "ring-2 ring-fg ring-offset-2 ring-offset-surface")}
                />
              ))}
            </div>
          </fieldset>
          <Button type="submit" fullWidth>
            Save
          </Button>
          <Button variant="danger" icon={Archive} onClick={() => void archive()} fullWidth>
            Archive this Space
          </Button>
        </form>
      </Sheet>
    </main>
  );
}
