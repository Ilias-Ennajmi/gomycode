import { fitWithin } from "@/lib/assets/pipeline-core";
import { captureVideoFrame } from "@/lib/assets/video";
import { getPlaybackStore, toggleVideoPlayback } from "../media/playback-store";
import { defaultsFor } from "../model/defaults";
import { oneStepOn } from "../model/one-step";
import type { VideoObj } from "../model/types";
import type { Command, CommandCtx } from "./registry";

/** Canvas point at the middle of the visible view. */
export function viewCentre(ctx: CommandCtx): { x: number; y: number } {
  const cam = ctx.canvas.getCamera();
  const vp = ctx.canvas.viewport();
  return { x: cam.x + vp.w / 2 / cam.z, y: cam.y + vp.h / 2 / cam.z };
}

/** A type specimen card (Inter, 40 px) in the middle of the view, selected, as one undo step. */
function insertTypeSpecimen(ctx: CommandCtx): void {
  const d = defaultsFor("typeSpecimen");
  const at = viewCentre(ctx);
  let id = "";
  oneStepOn(ctx.doc, () => {
    id = ctx.doc.create({ ...d, x: at.x - d.w / 2, y: at.y - d.h / 2 });
  });
  ctx.selection.set([id]);
}

// ---- video and GIF ---------------------------------------------------------------------------------------------------

function selectedVideos(ctx: CommandCtx): VideoObj[] {
  const out: VideoObj[] = [];
  for (const id of ctx.selection.ids) {
    const o = ctx.doc.get(id);
    if (o?.type === "video") out.push(o);
  }
  return out;
}

/** The one selected video (null for none, several, or another type). */
export function onlyVideo(ctx: CommandCtx): VideoObj | null {
  if (ctx.selection.size !== 1) return null;
  const [v] = selectedVideos(ctx);
  return v ?? null;
}

const GAP = 24;
const GRAB_SIDE = 320;

/** The live <video> of `v` with a picture to read, or a toast saying how to get one. */
function liveElement(ctx: CommandCtx, v: VideoObj): HTMLVideoElement | null {
  const el = getPlaybackStore().element(v.id);
  if (!el) ctx.toast({ message: "Play the video first, pause on the frame you want, then try again." });
  return el;
}

/** Set the poster to the frame the live video shows now. */
async function setPoster(ctx: CommandCtx): Promise<void> {
  const v = onlyVideo(ctx);
  const add = ctx.ui?.addAssetFile;
  if (!v || !add) return;
  const el = liveElement(ctx, v);
  if (!el) return;
  try {
    const blob = await captureVideoFrame(el);
    const t = Number.isFinite(el.currentTime) ? el.currentTime : v.posterTime;
    const assetId = await add(new File([blob], "poster.webp", { type: blob.type || "image/webp" }));
    oneStepOn(ctx.doc, () => {
      if (ctx.doc.get(v.id)?.type === "video") ctx.doc.update(v.id, { posterAssetId: assetId, posterTime: t });
    });
    ctx.toast({ message: "Poster frame set" });
  } catch (e) {
    ctx.toast({ message: e instanceof Error && e.message ? e.message : "Couldn't set the poster frame" });
  }
}

/** The frame the live video shows now as a new picture to the right of it. */
async function grabFrame(ctx: CommandCtx): Promise<void> {
  const v = onlyVideo(ctx);
  const add = ctx.ui?.addImageFile;
  if (!v || !add) return;
  const el = liveElement(ctx, v);
  if (!el) return;
  try {
    const blob = await captureVideoFrame(el);
    const seconds = Math.max(0, Math.round((Number.isFinite(el.currentTime) ? el.currentTime : 0) * 10) / 10);
    const size = fitWithin(v.w, v.h, GRAB_SIDE);
    const at = { x: v.x + v.w + GAP + size.w / 2, y: v.y + size.h / 2 };
    const id = await add(new File([blob], `frame-${seconds}s.webp`, { type: blob.type || "image/webp" }), at);
    ctx.selection.set([id]);
  } catch (e) {
    ctx.toast({ message: e instanceof Error && e.message ? e.message : "Couldn't grab that frame" });
  }
}

function toggleSetting(ctx: CommandCtx, key: "loop" | "muted"): void {
  const targets = selectedVideos(ctx).filter((v) => !v.locked);
  if (targets.length === 0) return;
  const next = !targets.every((v) => v[key]);
  oneStepOn(ctx.doc, () => targets.forEach((v) => ctx.doc.update(v.id, { [key]: next })));
}

const hasUnlockedVideo = (c: CommandCtx) => selectedVideos(c).some((v) => !v.locked);
const isVideoKind = (v: VideoObj | null): v is VideoObj => !!v && v.kind === "video";

/**
 * Commands for type specimens and video / GIF objects. The insert ones are in the "insert" group, which the More menu and
 * the command palette list.
 */
export const MEDIA_COMMANDS: Command[] = [
  { id: "insert.typeSpecimen", label: "Type specimen", group: "insert", run: insertTypeSpecimen },
  { id: "insert.video", label: "Video or GIF", group: "insert", when: (c) => !!c.ui?.pickVideos, run: (c) => c.ui?.pickVideos?.() },
  { id: "video.play", label: "Play or pause video", group: "edit", when: (c) => onlyVideo(c) !== null, run: (c) => void toggleVideoPlayback(onlyVideo(c)!.id) },
  { id: "video.toggleLoop", label: "Loop video", group: "edit", when: (c) => hasUnlockedVideo(c) && selectedVideos(c).some((v) => v.kind === "video"), run: (c) => toggleSetting(c, "loop") },
  { id: "video.toggleMute", label: "Mute video", group: "edit", when: hasUnlockedVideo, run: (c) => toggleSetting(c, "muted") },
  {
    id: "video.setPoster",
    label: "Use this frame as the poster",
    group: "edit",
    when: (c) => isVideoKind(onlyVideo(c)) && !onlyVideo(c)!.locked && !!c.ui?.addAssetFile,
    run: (c) => void setPoster(c),
  },
  { id: "video.grabFrame", label: "Grab frame as image", group: "edit", when: (c) => isVideoKind(onlyVideo(c)) && !!c.ui?.addImageFile, run: (c) => void grabFrame(c) },
];
