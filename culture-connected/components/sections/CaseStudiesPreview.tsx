'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { caseStudies } from '@/core/content/caseStudies';
import { homeContent } from '@/core/content/home';
import { localeHref } from '@/core/i18n/paths';
import { t } from '@/core/i18n/localized';
import type { Locale } from '@/core/i18n/config';
import { PlaceholderPanel } from '../ui/PlaceholderPanel';
import { Reveal } from '../ui/Reveal';

type Filter = 'all' | 'artist' | 'promoter';

function ArrowIcon({ direction }: { direction: 'prev' | 'next' }) {
  const d = direction === 'prev' ? 'M10 3L5 8l5 5' : 'M6 3l5 5-5 5';
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d={d} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CaseStudiesPreview({ locale }: { locale: Locale }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const c = homeContent;

  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: t(c.workFilters.all, locale) },
    { key: 'artist', label: t(c.workFilters.artist, locale) },
    { key: 'promoter', label: t(c.workFilters.promoter, locale) },
  ];

  const items = filter === 'all' ? caseStudies : caseStudies.filter((study) => study.side === filter);

  const updateScrollState = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setCanPrev(el.scrollLeft > 4);
    setCanNext(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }, []);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return undefined;
    updateScrollState();
    el.addEventListener('scroll', updateScrollState, { passive: true });
    window.addEventListener('resize', updateScrollState);
    return () => {
      el.removeEventListener('scroll', updateScrollState);
      window.removeEventListener('resize', updateScrollState);
    };
  }, [updateScrollState]);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollTo({ left: 0 });
    updateScrollState();
  }, [filter, updateScrollState]);

  function scrollByCard(direction: 1 | -1) {
    const track = trackRef.current;
    if (!track) return;
    const card = track.firstElementChild as HTMLElement | null;
    const gap = 16;
    const step = card ? card.getBoundingClientRect().width + gap : track.clientWidth;
    track.scrollBy({ left: direction * step, behavior: 'smooth' });
  }

  return (
    <section className="mx-auto max-w-[1440px] px-[clamp(18px,4vw,52px)] pt-[clamp(52px,7vw,84px)]">
      <div className="mb-[clamp(22px,3vw,34px)] flex flex-wrap items-center justify-between gap-4">
        <Reveal as="h2" className="font-display text-[clamp(28px,3.6vw,40px)] font-bold leading-none tracking-[-.035em] text-ink">
          {t(c.workHeading, locale)}
        </Reveal>
        <Reveal className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-1 rounded-full bg-chip p-[5px] font-mono text-[11px] uppercase tracking-[.1em]">
            {filters.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                aria-pressed={filter === f.key}
                className={`cursor-pointer rounded-full border-none px-[15px] py-[13px] transition-transform duration-150 active:scale-[0.96] md:py-[9px] ${
                  filter === f.key ? 'bg-inv text-onInv' : 'bg-transparent text-muted'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => scrollByCard(-1)}
              disabled={!canPrev}
              aria-label={t(c.workPrev, locale)}
              className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-line text-ink transition-transform duration-150 active:scale-90 disabled:cursor-not-allowed disabled:opacity-30 md:h-9 md:w-9"
            >
              <ArrowIcon direction="prev" />
            </button>
            <button
              type="button"
              onClick={() => scrollByCard(1)}
              disabled={!canNext}
              aria-label={t(c.workNext, locale)}
              className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-line text-ink transition-transform duration-150 active:scale-90 disabled:cursor-not-allowed disabled:opacity-30 md:h-9 md:w-9"
            >
              <ArrowIcon direction="next" />
            </button>
          </div>
        </Reveal>
      </div>

      <div ref={trackRef} className="no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-2">
        {items.map((study, i) => (
          <Reveal
            key={study.anchor}
            index={i}
            as={Link}
            href={`${localeHref(locale, '/case-studies')}#${study.anchor}`}
            className={`block flex-none snap-start text-inherit no-underline transition-transform duration-150 active:scale-[0.97] ${
              i === 0 ? 'w-[clamp(260px,34vw,380px)]' : 'w-[clamp(200px,22vw,270px)]'
            }`}
          >
            {study.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={study.image}
                alt={study.name}
                className={`photo-grade aspect-square w-full rounded-3xl object-cover ${i === 0 ? 'md:aspect-[4/5]' : ''}`}
                loading="lazy"
              />
            ) : (
              <PlaceholderPanel
                label={t(study.imageLabel, locale)}
                className="aspect-square rounded-3xl p-4"
                labelClassName="px-3 py-2 text-[11px]"
              />
            )}
            <div className="mt-4 font-sora text-[18px] font-semibold leading-[1.2] text-ink">{study.name}</div>
            <div className="mt-1 font-mono text-[11px] uppercase tracking-[.08em] text-muted"># {study.category}</div>
          </Reveal>
        ))}
      </div>

      <Reveal as="p" className="m-0 mt-6">
        <Link
          href={localeHref(locale, '/case-studies')}
          className="font-mono text-[12px] text-red no-underline"
        >
          {t(c.workLink, locale)}
        </Link>
      </Reveal>
    </section>
  );
}
