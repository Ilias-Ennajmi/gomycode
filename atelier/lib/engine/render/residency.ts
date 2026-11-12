// Memory budget for decoded image bitmaps. Pure: no DOM.
import { VARIANT_SIZES } from "@/lib/assets/variants";
import { TIERS, type ChosenVariant } from "./variant";

const MiB = 1024 * 1024;

/** Bytes of a decoded RGBA bitmap. */
export function decodedBytes(w: number, h: number): number {
  return Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0 ? w * h * 4 : 0;
}

/** 256 MiB; 128 MiB on a device reporting 4 GB or less; 96 MiB on a touch device. */
export function defaultBudgetBytes(env: { deviceMemory?: number; coarsePointer: boolean }): number {
  let budget = 256 * MiB;
  if (typeof env.deviceMemory === "number" && env.deviceMemory > 0 && env.deviceMemory <= 4) budget = 128 * MiB;
  if (env.coarsePointer) budget = Math.min(budget, 96 * MiB);
  return budget;
}

export interface ResidencyEntry {
  id: string;
  wanted: ChosenVariant;
  /** Decoded size of `wanted`. */
  w: number;
  h: number;
  /** On screen right now (not just inside the culling margin). */
  visible: boolean;
  /** When it was last on screen (ms, any monotonic clock). */
  lastSeen: number;
  /** Tiers the image really has, ascending. Default: all four. */
  tiers?: readonly ChosenVariant[];
}

type State = { e: ResidencyEntry; tier: ChosenVariant; ladder: readonly ChosenVariant[]; bytes: number; longest: number };

/** Decoded bytes of `tier` for an entry whose `wanted` tier is `from` and measures w x h. */
function bytesAt(e: ResidencyEntry, longest: number, tier: ChosenVariant): number {
  if (tier === e.wanted) return decodedBytes(e.w, e.h);
  if (longest <= 0) return 0;
  const target = tier === "original" ? longest : Math.min(VARIANT_SIZES[tier], longest);
  const s = target / longest;
  return decodedBytes(e.w * s, e.h * s);
}

/**
 * Decides which tier each mounted image may keep so the decoded bitmaps fit the budget. Entries are demoted one tier at
 * a time, never below the lowest tier they have: first those off screen (least recently seen first), then those on
 * screen (largest first). If everything is at its floor and still over budget, it stops there.
 */
export class ImageResidency {
  private readonly budget: number;
  private used = 0;

  constructor(opts: { budgetBytes: number }) {
    this.budget = Number.isFinite(opts.budgetBytes) && opts.budgetBytes >= 0 ? opts.budgetBytes : 256 * MiB;
  }

  plan(entries: ResidencyEntry[]): Map<string, ChosenVariant> {
    const states: State[] = entries.map((e) => {
      const ladder = (e.tiers && e.tiers.length ? TIERS.filter((t) => e.tiers!.includes(t)) : TIERS) as readonly ChosenVariant[];
      const longest = Math.max(Number.isFinite(e.w) ? e.w : 0, Number.isFinite(e.h) ? e.h : 0);
      return { e, tier: e.wanted, ladder, bytes: decodedBytes(e.w, e.h), longest };
    });
    let total = 0;
    for (const s of states) total += s.bytes;

    const demote = (s: State): boolean => {
      const at = s.ladder.indexOf(s.tier);
      // A wanted tier that is not on the ladder (stale metadata) is left alone.
      if (at <= 0) return false;
      const next = s.ladder[at - 1];
      const bytes = bytesAt(s.e, s.longest, next);
      total += bytes - s.bytes;
      s.tier = next;
      s.bytes = bytes;
      return true;
    };

    if (total > this.budget) {
      // Off screen first, least recently seen first; each is taken all the way down before the next is touched.
      const hidden = states.filter((s) => !s.e.visible).sort((a, b) => (a.e.lastSeen || 0) - (b.e.lastSeen || 0));
      for (const s of hidden) {
        while (total > this.budget && demote(s));
        if (total <= this.budget) break;
      }
      // Then on screen, one tier off the largest each time.
      if (total > this.budget) {
        const shown = states.filter((s) => s.e.visible);
        while (total > this.budget) {
          let pick: State | null = null;
          for (const s of shown) {
            if (s.ladder.indexOf(s.tier) <= 0) continue;
            if (!pick || s.bytes > pick.bytes) pick = s;
          }
          if (!pick) break;
          demote(pick);
        }
      }
    }

    this.used = total;
    const out = new Map<string, ChosenVariant>();
    for (const s of states) out.set(s.e.id, s.tier);
    return out;
  }

  /** Decoded bytes of the last plan. */
  usedBytes(): number {
    return this.used;
  }
}
