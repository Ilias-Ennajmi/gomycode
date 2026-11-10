import { Clapperboard, Globe, Image as ImageIcon, Music2, TvMinimalPlay, type LucideIcon } from "lucide-react";
import { PLATFORM_LABEL, type Platform } from "@/lib/links";
import { cx } from "./cx";

// lucide has no brand marks, so each source gets the plain icon closest to what it is.
export const PLATFORM_ICON: Record<Platform, LucideIcon> = {
  instagram: Clapperboard,
  tiktok: Music2,
  youtube: TvMinimalPlay,
  web: Globe,
  screenshot: ImageIcon,
};

/** Where a save came from: icon + name (the name is what carries the meaning). */
export function PlatformBadge({ platform, className, label }: { platform: Platform; className?: string; label?: string }) {
  const Icon = PLATFORM_ICON[platform];
  return (
    <span className={cx("inline-flex items-center gap-1.5", className)}>
      <Icon size={16} strokeWidth={2} aria-hidden />
      {label ?? (platform === "web" ? "Article" : PLATFORM_LABEL[platform])}
    </span>
  );
}
