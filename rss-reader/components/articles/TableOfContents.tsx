"use client";

import * as React from "react";
import { ListTree } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";

export interface Heading {
  id: string;
  text: string;
  level: 2 | 3;
  top: number;
}

/** The headings of the article body (h2, h3), with their offset in the scrolling pane. */
export function readHeadings(body: HTMLElement | null, scroller: HTMLElement | null): Heading[] {
  if (!body || !scroller) return [];
  const scrollerTop = scroller.getBoundingClientRect().top;
  return Array.from(body.querySelectorAll<HTMLElement>("h2, h3"))
    .map((node, i) => {
      const text = node.textContent?.trim() ?? "";
      if (!text) return null;
      if (!node.id) node.id = `h-${i}`;
      return {
        id: node.id,
        text: text.slice(0, 120),
        level: node.tagName === "H2" ? (2 as const) : (3 as const),
        top: node.getBoundingClientRect().top - scrollerTop + scroller.scrollTop,
      };
    })
    .filter((h): h is Heading => h !== null);
}

/** A "Contents" button for long reads: tap a heading to jump there; the one you're in is marked. */
export function TableOfContents({
  headings,
  scrollRef,
  className,
}: {
  headings: Heading[];
  scrollRef: React.RefObject<HTMLElement>;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [current, setCurrent] = React.useState<string | null>(null);
  if (headings.length < 3) return null;

  const openList = () => {
    const scroller = scrollRef.current;
    const top = (scroller?.scrollTop ?? 0) + 80;
    let active: string | null = null;
    for (const h of headings) {
      const node = scroller?.querySelector<HTMLElement>(`#${CSS.escape(h.id)}`);
      const at =
        node && scroller
          ? node.getBoundingClientRect().top -
            scroller.getBoundingClientRect().top +
            scroller.scrollTop
          : h.top;
      if (at <= top) active = h.id;
    }
    setCurrent(active);
    setOpen(true);
  };
  const jump = (heading: Heading) => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    // Where the heading is now (pictures above it may have loaded since it was measured).
    const node = scroller.querySelector<HTMLElement>(`#${CSS.escape(heading.id)}`);
    const top = node
      ? node.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
      : heading.top;
    scroller.scrollTo({ top: Math.max(0, top - 16), behavior: "smooth" });
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className={className}
        onClick={openList}
        aria-label="Contents"
        title="Contents"
      >
        <ListTree className="h-5 w-5" />
      </Button>
      <Sheet open={open} onOpenChange={setOpen} title="Contents">
        <ol className="space-y-0.5 px-1">
          {headings.map((heading) => (
            <li key={heading.id}>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  jump(heading);
                }}
                className={cn(
                  "w-full rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
                  heading.level === 3 && "pl-7 text-[13px] text-muted-foreground",
                  current === heading.id && "bg-primary/10 font-medium text-foreground"
                )}
              >
                {heading.text}
              </button>
            </li>
          ))}
        </ol>
      </Sheet>
    </>
  );
}
