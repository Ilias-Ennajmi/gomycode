'use client';

import { useEffect, useRef, useState } from 'react';
import { t } from '@/core/i18n/localized';
import type { Locale } from '@/core/i18n/config';
import type { CaseStudy } from '@/core/content/caseStudies';
import { caseStudiesPageContent } from '@/core/content/caseStudies';
import { PlaceholderPanel } from '../ui/PlaceholderPanel';
import { Reveal } from '../ui/Reveal';
import { StatCounter } from '../ui/StatCounter';
import { StatRow, type StatRowItem } from '../ui/StatRow';
import { ZoomImage } from '../ui/ZoomImage';

/**
 * Collapsed by default on every breakpoint, opened via an explicit
 * "Read more" button (desktop used to force-expand here; the user
 * specifically asked for a real Read more button instead). A red left rule
 * and category tag replace the flush hairline divider that used to sit
 * above the text.
 */
export function CaseStudyCard({ study, locale }: { study: CaseStudy; locale: Locale }) {
  const [open, setOpen] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const reverseOrder = parseInt(study.index, 10) % 2 === 0;

  useEffect(() => {
    if (window.location.hash === `#${study.anchor}`) setOpen(true);
  }, [study.anchor]);

  const statItems: StatRowItem[] = study.stats.map((stat) => ({
    value: stat.value,
    decimals: stat.decimals,
    prefix: stat.prefix,
    suffix: stat.suffix,
    label: t(stat.label, locale),
  }));

  return (
    <section id={study.anchor} className="mx-auto max-w-[1440px] px-[clamp(18px,4vw,52px)] pt-[clamp(32px,4.4vw,56px)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center justify-between gap-4 border-l-[3px] border-red bg-surface py-[clamp(18px,2.6vw,26px)] pl-[clamp(18px,2.6vw,26px)] pr-[clamp(14px,2vw,22px)] text-left transition-colors duration-150 hover:bg-chip active:scale-[0.99]"
      >
        <div className="flex min-w-0 flex-1 items-center gap-4">
          {study.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={study.image}
              alt=""
              loading="lazy"
              className="h-[64px] w-[64px] flex-none object-cover"
            />
          ) : (
            <PlaceholderPanel label="" className="h-[64px] w-[64px] flex-none" />
          )}
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2">
              <span className="bg-red px-[9px] py-[3px] font-mono text-[10px] uppercase tracking-[.1em] text-white">
                {study.category}
              </span>
              <span className="font-mono text-[11px] text-muted">{study.index}</span>
            </div>
            <h2 className="m-0 font-display text-[clamp(24px,3.4vw,36px)] font-extrabold leading-[1.08] tracking-[-.02em] text-ink">
              {study.name}
            </h2>
            <p className="m-0 mt-1 max-w-[440px] font-inter text-[14px] font-light leading-[1.5] text-muted">
              {t(study.summary, locale)}
            </p>
          </div>
        </div>
        <div className="hidden flex-none items-center gap-6 md:flex">
          {study.stats.slice(0, 2).map((stat, i) => (
            <div key={i} className="text-center">
              <StatCounter
                value={stat.value}
                decimals={stat.decimals}
                prefix={stat.prefix}
                suffix={stat.suffix}
                className="font-display text-[22px] font-extrabold leading-none text-ink"
              />
              <div className="mt-1 max-w-[92px] font-inter text-[10px] leading-[1.3] text-muted">{t(stat.label, locale)}</div>
            </div>
          ))}
        </div>
        <span className="flex flex-none items-center gap-[10px] font-mono text-[11px] uppercase tracking-[.08em] text-red">
          <span className="hidden sm:inline">
            {open ? t(caseStudiesPageContent.readLessLabel, locale) : t(caseStudiesPageContent.readMoreLabel, locale)}
          </span>
          <span
            aria-hidden="true"
            className="flex h-9 w-9 flex-none items-center justify-center border border-red text-[18px] leading-none text-red transition-transform duration-300"
            style={{ transform: open ? 'rotate(45deg)' : 'none' }}
          >
            +
          </span>
        </span>
      </button>

      <div
        className="overflow-hidden transition-[max-height,opacity] duration-[400ms] ease-out"
        style={{ maxHeight: open ? `${(bodyRef.current?.scrollHeight ?? 1600) + 24}px` : '0px', opacity: open ? 1 : 0 }}
      >
        <div
          ref={bodyRef}
          className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-[clamp(22px,3vw,44px)] px-[clamp(18px,2.6vw,26px)] pb-2 pt-[clamp(20px,3vw,32px)]"
        >
          <Reveal className={reverseOrder ? 'md:order-2' : 'md:order-1'}>
            {(shown) =>
              study.image ? (
                <ZoomImage src={study.image} alt={study.name} shown={shown} className="h-[clamp(160px,22vw,260px)] w-full" />
              ) : (
                <PlaceholderPanel
                  label={t(study.imageLabel, locale)}
                  className="h-[clamp(160px,22vw,260px)] p-4"
                  labelClassName="px-3 py-2 text-[11px]"
                />
              )
            }
          </Reveal>
          <Reveal className={`flex flex-col gap-[22px] ${reverseOrder ? 'md:order-1' : 'md:order-2'}`}>
            <div>
              <div className="mb-2 font-mono text-[11px] text-red">OBJECTIVE</div>
              <p className="m-0 font-inter text-[16px] font-light leading-[1.6] text-ink">{t(study.objective, locale)}</p>
            </div>
            <div>
              <div className="mb-2 font-mono text-[11px] text-red">WHAT WE DID</div>
              <p className="m-0 font-inter text-[16px] font-light leading-[1.6] text-ink">{t(study.whatWeDid, locale)}</p>
            </div>
            <div className="border-t-2 border-red pt-5">
              <StatRow stats={statItems} />
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
