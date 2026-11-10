"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ChevronLeft, Pencil, Play, Share } from "lucide-react";
import { AiLabel } from "@/components/ui/AiLabel";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Segmented } from "@/components/ui/Segmented";
import { Sheet } from "@/components/ui/Sheet";
import { Skeleton } from "@/components/ui/Skeleton";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { cx } from "@/components/ui/cx";
import { SPACE_BG, SPACE_TEXT, SPACE_TINT, type SpaceColor } from "@/components/ui/space";
import { SPACE_ICONS } from "@/components/ui/spaceIcons";
import { SpaceIcon } from "@/components/ui/SpaceIcon";
import { SaveGrid } from "@/components/library/SaveGrid";
import { ExportSheet } from "@/components/space/ExportSheet";
import { SpaceColorSheet, SpaceColorSwatches } from "@/components/space/ColorPicker";
import { useAppearance } from "@/components/theme/ThemeProvider";
import { useLibrary } from "@/lib/hooks/useLibrary";
import { useLongPress } from "@/lib/hooks/useLongPress";
import { archiveSpace, updateSpace, type Space, type SpacePatch } from "@/lib/data";
import { latestSynthesis, type Synthesis } from "@/lib/exports";
import { filterSaves } from "@/lib/queue";

export function kindLabel(space: Pick<Space, "kind" | "dueDate">): string {
  if (space.kind === "inbox") return "Inbox";
  if (space.kind !== "project") return "Topic";
  if (!space.dueDate) return "Project";
  const d = new Date(`${space.dueDate}T12:00:00`);
  return Number.isNaN(d.getTime()) ? "Project" : `Project · due ${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
}

export function SpaceView({ id }: { id: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const { appearance } = useAppearance();
  const lib = useLibrary();
  const [editOpen, setEditOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState<SpaceColor>("violet");
  const [kind, setKind] = useState<"topic" | "project">("topic");
  const [icon, setIcon] = useState<string | null>(null);
  const [due, setDue] = useState("");
  const [synthesis, setSynthesis] = useState<Synthesis | null>(null);

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
  const appliedOrKept = items.filter((s) => s.appliedAt || s.kept).length;
  const unwatched = items.filter((s) => !s.watchedAt && s.status !== "queued" && s.status !== "processing").length;

  useEffect(() => {
    if (!space || space.kind === "inbox") return;
    let alive = true;
    latestSynthesis(space.id)
      .then((s) => alive && setSynthesis(s))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [space]);

  const chipPress = useLongPress(space && space.kind !== "inbox" ? () => setColorOpen(true) : undefined);

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

  const save = async (values: SpacePatch, local: Partial<Space>) => {
    lib.setSpaces((prev) => prev.map((s) => (s.id === space.id ? { ...s, ...local } : s)));
    try {
      await updateSpace(space.id, values);
    } catch {
      toast({ message: "Couldn't save the change. Check your connection." });
      void lib.refresh();
    }
  };

  const openEdit = () => {
    setName(space.name);
    setDescription(space.description ?? "");
    setColor(space.color);
    setKind(space.kind === "project" ? "project" : "topic");
    setIcon(space.icon ?? null);
    setDue(space.dueDate ?? "");
    setEditOpen(true);
  };

  const saveEdit = () => {
    const values: SpacePatch = {
      name: name.trim() || space.name,
      description: description.trim() || null,
      color_token: color,
      kind,
      icon,
      due_date: kind === "project" && due ? due : null,
    };
    setEditOpen(false);
    void save(values, {
      name: values.name,
      description: values.description ?? null,
      color,
      kind,
      icon,
      dueDate: values.due_date ?? null,
    });
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
        <button
          type="button"
          {...chipPress}
          aria-label={isInbox ? undefined : `${kindLabel(space)}. Hold to change the colour`}
          className="flex h-12 items-center self-start"
        >
          <span className={cx("inline-flex h-8 items-center gap-2 rounded-full px-3 text-label", SPACE_TINT[space.color], SPACE_TEXT[space.color])}>
            {space.icon && SPACE_ICONS[space.icon] ? <SpaceIcon name={space.icon} /> : <span aria-hidden className={cx("h-2 w-2 rounded-full", SPACE_BG[space.color])} />}
            {kindLabel(space)}
          </span>
        </button>
        <h1 className="text-display">{space.name}</h1>
        {space.description && <p className="text-body text-fg-muted">{space.description}</p>}

        <dl className="grid grid-cols-3 gap-2">
          {(
            [
              ["saved", items.length],
              ["watched", watched],
              ["applied", applied],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="flex flex-col-reverse rounded-card border border-line bg-surface p-3">
              <dt className="text-caption text-fg-muted">{label}</dt>
              <dd className="text-title">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="flex gap-2">
          {unwatched > 0 && (
            <Link
              href={`/play?space=${isInbox ? "inbox" : space.id}&filter=unwatched`}
              className="flex h-14 flex-1 items-center justify-center gap-2 rounded-card bg-accent text-label text-on-accent active:scale-95"
            >
              <Play size={24} strokeWidth={2} fill="currentColor" aria-hidden />
              Play {unwatched} unwatched
            </Link>
          )}
          {!isInbox && items.length > 0 && (
            <Button variant="secondary" size="lg" icon={Share} onClick={() => setExportOpen(true)} className={unwatched > 0 ? "" : "flex-1"}>
              Export
            </Button>
          )}
        </div>

        {synthesis && synthesis.points.length > 0 && (
          <article className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
            <AiLabel text="What these saves say" />
            {synthesis.topic && <h2 className="text-heading">{synthesis.topic}</h2>}
            <ul className="flex flex-col gap-2">
              {synthesis.points.slice(0, 3).map((p) => (
                <li key={p} className="text-body text-fg">
                  {p}
                </li>
              ))}
            </ul>
            {synthesis.action && <p className="text-label text-fg">Try: {synthesis.action}</p>}
            {synthesis.count > 0 && <p className="text-caption text-fg-muted">From {synthesis.count} saves</p>}
          </article>
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
          badge={(s) => (s.appliedAt ? "Applied" : null)}
          onOpen={(s) => router.push(`/item/${s.id}`)}
        />
      )}

      {!isInbox && (
        <>
          <ExportSheet
            open={exportOpen}
            onClose={() => setExportOpen(false)}
            spaceId={space.id}
            spaceName={space.name}
            countAll={items.length}
            countAppliedKept={appliedOrKept}
          />
          <SpaceColorSheet
            open={colorOpen}
            onClose={() => setColorOpen(false)}
            name={space.name}
            value={space.color}
            onPick={(c) => void save({ color_token: c }, { color: c })}
          />
        </>
      )}

      <Sheet open={editOpen} onClose={() => setEditOpen(false)} label="Edit Space" title="Edit Space">
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            saveEdit();
          }}
        >
          <TextField label="Name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          <TextField
            label="Description"
            value={description}
            maxLength={200}
            placeholder="What is this Space for?"
            onChange={(e) => setDescription(e.target.value)}
          />
          <Segmented
            label="Kind"
            options={[
              { value: "topic", label: "Topic" },
              { value: "project", label: "Project" },
            ]}
            value={kind}
            onChange={(v) => setKind(v as "topic" | "project")}
          />
          {kind === "project" && (
            <TextField label="Due date" type="date" value={due} onChange={(e) => setDue(e.target.value)} hint="Optional" />
          )}
          <fieldset className="flex flex-col gap-2">
            <legend className="text-label text-fg">Colour</legend>
            <SpaceColorSwatches value={color} onChange={setColor} />
          </fieldset>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-label text-fg">Icon</legend>
            <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Icon">
              {Object.entries(SPACE_ICONS).map(([key, { icon: I, label }]) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-label={label}
                  aria-checked={icon === key}
                  onClick={() => setIcon(icon === key ? null : key)}
                  className={cx(
                    "flex h-12 w-12 items-center justify-center rounded-full",
                    icon === key ? cx(SPACE_TINT[color], SPACE_TEXT[color], "ring-2 ring-fg") : "text-fg-muted hover:bg-raised",
                  )}
                >
                  <I size={24} strokeWidth={2} aria-hidden />
                </button>
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
