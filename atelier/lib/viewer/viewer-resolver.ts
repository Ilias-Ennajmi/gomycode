// Where a visitor's browser loads pictures from: the R2 host the server wrote into the board, and only for assets the board
// lists. The same interface as the editor's resolver, so the link card and other shared views work unchanged.
import { assetKey, isAssetId, type AssetVariant } from "@/lib/assets/asset-id";
import type { AssetResolver } from "@/lib/assets/resolver-types";
import type { VariantName } from "@/lib/assets/variants";
import type { ViewerBoard } from "./viewer-types";

export class ViewerResolver implements AssetResolver {
  constructor(private readonly board: Pick<ViewerBoard, "assets" | "assetBase">) {}

  url(assetId: string, variant: AssetVariant): string | null {
    const a = isAssetId(assetId) ? this.board.assets[assetId] : undefined;
    if (!a || !this.board.assetBase) return null;
    // The variant asked for, then w1024, then the original (which always exists).
    const chain: AssetVariant[] = variant === "original" ? ["original"] : variant === "w1024" ? ["w1024", "original"] : [variant, "w1024", "original"];
    for (const v of chain) {
      if (v === "original" || a.variants.includes(v as VariantName)) return `${this.board.assetBase}/${assetKey(assetId, v)}`;
    }
    return null;
  }

  /** The "Credit · Licence" line of an asset, only when the board carries it (the link shows credits). */
  assetCredit(assetId: string): string | null {
    const a = isAssetId(assetId) ? this.board.assets[assetId] : undefined;
    return a?.credit ?? null;
  }

  available(assetId: string): { variants: VariantName[]; width: number; height: number } | null {
    const a = isAssetId(assetId) ? this.board.assets[assetId] : undefined;
    return a ? { variants: [...a.variants], width: a.w, height: a.h } : null;
  }
}
