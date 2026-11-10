"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardPaste, Download, Share2, Sparkles, SquareMousePointer } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { Illustration } from "@/components/brand/Illustration";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { SPACE_BG, type SpaceColor } from "@/components/ui/space";

const STEPS: { icon: typeof Share2; color: SpaceColor; title: string; text: string }[] = [
  { icon: Share2, color: "violet", title: "Tap Share on a reel", text: "In Instagram or TikTok, on any video you want to keep." },
  { icon: SquareMousePointer, color: "amber", title: "Pick Stash", text: "It saves in a second, even offline. Back takes you to the reel." },
  { icon: Sparkles, color: "teal", title: "Stash reads it for you", text: "The key idea, takeaways and a Space. Your 5 for today builds from it." },
];

/**
 * First run (no saves yet): says hello, shows how sharing into Stash works, and offers the
 * two ways to start (paste a link, bring the saves you already have).
 */
export function Welcome() {
  const router = useRouter();
  return (
    <div className="flex flex-col gap-6 px-4 pt-8 pb-8">
      <header className="flex flex-col gap-5">
        <Logo variant="lockup" size={40} animate title="Stash" />
        <div className="rise-in flex flex-col gap-2">
          <h1 className="text-display">Keep the reels worth keeping.</h1>
          <p className="text-body text-fg-muted">Save from Instagram and TikTok, watch in one place, and actually use what you learn.</p>
        </div>
      </header>

      <section aria-labelledby="how-title" className="rise-in flex flex-col gap-3 rounded-xl bg-raised p-5" style={{ animationDelay: "calc(var(--dur-fast) * 0.6)" }}>
        <div className="flex items-center justify-between gap-3">
          <h2 id="how-title" className="text-heading">
            How to save a reel
          </h2>
          <Illustration name="share" className="-my-3 h-24 shrink-0" />
        </div>
        <ol className="flex flex-col gap-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex items-start gap-3">
              <span className={cx("flex h-11 w-11 shrink-0 items-center justify-center rounded-card text-on-space", SPACE_BG[s.color])}>
                <s.icon size={22} strokeWidth={2.25} aria-hidden />
              </span>
              <div className="min-w-0 pt-0.5">
                <p className="text-label">
                  <span className="text-fg-muted">{i + 1}. </span>
                  {s.title}
                </p>
                <p className="text-caption text-fg-muted">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <div className="rise-in flex flex-col gap-2" style={{ animationDelay: "calc(var(--dur-fast) * 1.2)" }}>
        <Button size="lg" icon={ClipboardPaste} fullWidth onClick={() => router.push("/library?paste=1")}>
          Paste a link to try it
        </Button>
        <Link href="/import" className="press tap inline-flex items-center justify-center gap-2 rounded-full px-4 text-label text-fg">
          <Download size={20} strokeWidth={2} aria-hidden />
          Bring the saves you already have
        </Link>
      </div>
    </div>
  );
}
