'use client';

import { useState } from 'react';
import Link from 'next/link';
import { caseStudies } from '@/core/content/caseStudies';
import { t, type Localized } from '@/core/i18n/localized';
import type { Locale } from '@/core/i18n/config';
import { localeHref } from '@/core/i18n/paths';
import { HoverHeading } from '../ui/HoverHeading';
import { StatRow, type StatRowItem } from '../ui/StatRow';
import { PlaceholderPanel } from '../ui/PlaceholderPanel';
import { ZoomImage } from '../ui/ZoomImage';
import { Reveal } from '../ui/Reveal';

interface ProofShowcaseProps {
  locale: Locale;
  /** Anchors into core/content/caseStudies.ts — the pool this page's Shuffle button cycles through. */
  pool: string[];
  heading: Localized;
  variant?: 'dark' | 'light';
  note?: Localized;
  linkLabel?: Localized;
}

function ShuffleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M1.5 4h2.7L9 12h4.5M9.3 4H14M11.3 1.8l2.2 2.2-2.2 2.2M11.3 14.2l2.2-2.2-2.2-2.2M1.5 12h2.7L6 8.4"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * One full client case at a time (objective, what we did, its real stats),
 * with a Shuffle button that swaps in a different case from `pool`. Replaces
 * a bare StatRow of 3 disconnected numbers with an actual story, reusing
 * the exact data already backing the Case Studies page — no new content.
 */
export function ProofShowcase({ locale, pool, heading, variant = 'light', note, linkLabel }: ProofShowcaseProps) {
  const studies = pool
    .map((anchor) => caseStudies.find((study) => study.anchor === anchor))
    .filter((study): study is NonNullable<typeof study> => Boolean(study));
  const [index, setIndex] = useState(0);
  const dark = variant === 'dark';
  const study = studies[index] ?? studies[0];

  function shuffle() {
    if (studies.length < 2) return;
    let next = index;
    while (next === index) next = Math.floor(Math.random() * studies.length);
    setIndex(next);
  }

  if (!study) return null;

  const statItems: StatRowItem[] = study.stats.map((stat) => ({
    value: stat.value,
    decimals: stat.decimals,
    prefix: stat.prefix,
    suffix: stat.suffix,
    label: t(stat.label, locale),
  }));

  return (
    <div className={dark ? 'bg-inv p-[clamp(32px,4.4vw,56px)] text-onInv' : ''}>
      <div className="mb-[clamp(24px,3.4vw,40px)] flex flex-wrap items-baseline justify-between gap-[14px]">
        <HoverHeading
          className={`font-display text-[clamp(28px,3.6vw,40px)] font-extrabold leading-none tracking-[-.025em] ${
            dark ? '' : 'text-ink'
          }`}
        >
          {t(heading, locale)}
        </HoverHeading>
        <div className="flex flex-wrap items-center gap-[14px]">
          {note ? <span className={`font-mono text-[11px] ${dark ? 'text-onInv/60' : 'text-muted'}`}>{t(note, locale)}</span> : null}
          {linkLabel ? (
            <Link href={localeHref(locale, '/case-studies')} className="font-mono text-[12px] text-red no-underline">
              {t(linkLabel, locale)}
            </Link>
          ) : null}
          {studies.length > 1 ? (
            <button
              type="button"
              onClick={shuffle}
              className={`flex cursor-pointer items-center gap-2 border px-[15px] py-[9px] font-mono text-[11px] uppercase tracking-[.08em] transition-transform duration-150 active:scale-95 ${
                dark ? 'border-onInv/30 text-onInv hover:border-onInv' : 'border-line text-ink hover:border-ink'
              }`}
            >
              <ShuffleIcon />
              {locale === 'fr' ? 'Changer de cas' : 'Shuffle case'}
            </button>
          ) : null}
        </div>
      </div>

      <Reveal key={study.anchor} className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-[clamp(24px,3.4vw,44px)]">
        {(shown) =>
          study.image ? (
            <ZoomImage src={study.image} alt={study.name} shown={shown} className="h-[clamp(180px,22vw,280px)] w-full" />
          ) : (
            <PlaceholderPanel
              label={t(study.imageLabel, locale)}
              className="h-[clamp(180px,22vw,280px)] p-4"
              labelClassName="px-3 py-2 text-[11px]"
            />
          )
        }
      </Reveal>
      <div className="mt-[clamp(24px,3.4vw,44px)]">
        <div className={`mb-2 font-mono text-[11px] tracking-[.12em] ${dark ? 'text-onInv/60' : 'text-red'}`}>
          {study.index} / {study.category}
        </div>
        <div className="mb-4 font-display text-[clamp(22px,2.6vw,30px)] font-extrabold leading-[1.05] tracking-[-.02em]">
          {study.name}
        </div>
        <p className={`m-0 mb-6 max-w-[640px] font-inter text-[15px] font-light leading-[1.6] ${dark ? 'text-onInv/75' : 'text-muted'}`}>
          {t(study.objective, locale)}
        </p>
        <div className={`border-t-2 pt-5 ${dark ? 'border-onInv/25' : 'border-red'}`}>
          <StatRow stats={statItems} emphasizeFirst={!dark} invert={dark} />
        </div>
      </div>
    </div>
  );
}
