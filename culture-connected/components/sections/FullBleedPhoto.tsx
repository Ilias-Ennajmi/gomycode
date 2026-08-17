'use client';

import { useEffect, useRef, useState } from 'react';

interface FullBleedPhotoProps {
  src: string;
  alt: string;
  caption: string;
}

/**
 * Edge-to-edge photo break with a subtle scroll-linked parallax — the one
 * section on the page that doesn't fade-up-on-scroll like everything else.
 * Rebuilt with real client photography (already in /public), not a
 * placeholder. Parallax is skipped under prefers-reduced-motion, matching
 * the convention in globals.css/useReveal.
 */
export function FullBleedPhoto({ src, alt, caption }: FullBleedPhotoProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return undefined;

    let ticking = false;

    const update = () => {
      const el = sectionRef.current;
      ticking = false;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      if (rect.bottom < 0 || rect.top > vh) return;
      const progress = (vh - rect.top) / (vh + rect.height);
      setOffset((Math.min(1, Math.max(0, progress)) - 0.5) * 60);
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  return (
    <section ref={sectionRef} className="relative mt-[clamp(60px,8vw,96px)] h-[clamp(340px,52vw,600px)] overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className="absolute left-0 top-1/2 h-[130%] w-full -translate-y-1/2 object-cover"
        style={{ transform: `translateY(calc(-50% + ${offset}px))` }}
      />
      <div className="absolute inset-0 bg-inv/[.15]" />
      <div className="absolute bottom-5 left-[clamp(18px,4vw,52px)] border border-onInv/40 bg-inv/60 px-[14px] py-[8px] backdrop-blur-[2px]">
        <span className="font-mono text-[11px] uppercase tracking-[.1em] text-onInv">{caption}</span>
      </div>
    </section>
  );
}
