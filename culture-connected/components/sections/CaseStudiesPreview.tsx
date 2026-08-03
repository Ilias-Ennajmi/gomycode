'use client';

import { useState } from 'react';
import Link from 'next/link';
import { caseStudies } from '@/core/content/caseStudies';
import { homeContent } from '@/core/content/home';
import { localeHref } from '@/core/i18n/paths';
import { t } from '@/core/i18n/localized';
import type { Locale } from '@/core/i18n/config';
import { PlaceholderPanel } from '../ui/PlaceholderPanel';
import { Reveal } from '../ui/Reveal';

type Filter = 'all' | 'artist' | 'promoter';

export function CaseStudiesPreview({ locale }: { locale: Locale }) {
  const [filter, setFilter] = useState<Filter>('all');
  const c = homeContent;

  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: t(c.workFilters.all, locale) },
    { key: 'artist', label: t(c.workFilters.artist, locale) },
    { key: 'promoter', label: t(c.workFilters.promoter, locale) },
  ];

  const items = filter === 'all' ? caseStudies : caseStudies.filter((study) => study.side === filter);

  return (
    <section className="mx-auto max-w-[1440px] px-[clamp(18px,4vw,52px)] pt-[clamp(52px,7vw,84px)]">
      <div className="mb-[clamp(22px,3vw,34px)] flex flex-wrap items-center justify-between gap-4">
        <Reveal as="h2" className="font-sora text-[clamp(28px,3.6vw,40px)] font-bold leading-none tracking-[-.035em] text-ink">
          {t(c.workHeading, locale)}
        </Reveal>
        <Reveal className="flex flex-wrap gap-1 rounded-full bg-chip p-[5px] font-mono text-[11px] uppercase tracking-[.1em]">
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
              className={`cursor-pointer rounded-full border-none px-[15px] py-[9px] ${
                filter === f.key ? 'bg-inv text-onInv' : 'bg-transparent text-muted'
              }`}
            >
              {f.label}
            </button>
          ))}
        </Reveal>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-4">
        {items.map((study, i) => (
          <Reveal
            key={study.anchor}
            index={i}
            as={Link}
            href={`${localeHref(locale, '/case-studies')}#${study.anchor}`}
            className="block text-inherit no-underline"
          >
            <PlaceholderPanel
              label={t(study.imageLabel, locale)}
              className="aspect-square rounded-3xl p-4"
              labelClassName="px-3 py-2 text-[11px]"
            />
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
