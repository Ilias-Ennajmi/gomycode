'use client';

import { useEffect, useRef, useState } from 'react';
import { t } from '@/core/i18n/localized';
import type { Locale } from '@/core/i18n/config';
import type { CaseStudy } from '@/core/content/caseStudies';
import { PlaceholderPanel } from '../ui/PlaceholderPanel';
import { StatCounter } from '../ui/StatCounter';
import { Reveal } from '../ui/Reveal';
import { GhostNumeral } from '../ui/GhostNumeral';

/**
 * On mobile: a tappable header (index/category/name) that expands to reveal
 * the full detail body — cuts the six-study page from ~8 screens of scroll
 * to ~2 until the visitor opens one. On desktop the body is always fully
 * visible (the `md:!max-h-none md:!opacity-100` override wins over the
 * inline collapse styles), matching the original always-expanded layout.
 */
export function CaseStudyCard({ study, locale }: { study: CaseStudy; locale: Locale }) {
  const [open, setOpen] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const reverseOrder = parseInt(study.index, 10) % 2 === 0;

  useEffect(() => {
    if (window.location.hash === `#${study.anchor}`) setOpen(true);
  }, [study.anchor]);

  return (
    <section id={study.anchor} className="mx-auto max-w-[1440px] px-[clamp(18px,4vw,52px)] pt-[clamp(34px,5vw,64px)]">
      <div className="border-t border-line pt-[clamp(24px,3vw,38px)]">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full cursor-pointer items-center justify-between gap-4 text-left transition-transform active:scale-[0.98] md:hidden"
        >
          <div>
            <div className="mb-1 font-mono text-[11px] tracking-[.12em] text-red">
              {study.index} / {study.category}
            </div>
            <h2 className="m-0 font-display text-[24px] font-bold leading-[1.1] tracking-[-.03em] text-ink">{study.name}</h2>
          </div>
          <span
            aria-hidden="true"
            className="flex h-9 w-9 flex-none items-center justify-center rounded-full border border-line font-sora text-[20px] leading-none text-red transition-transform duration-300"
            style={{ transform: open ? 'rotate(45deg)' : 'none' }}
          >
            +
          </span>
        </button>

        <div
          className="overflow-hidden transition-[max-height,opacity] duration-[400ms] ease-out md:!max-h-none md:!opacity-100"
          style={{ maxHeight: open ? `${(bodyRef.current?.scrollHeight ?? 1600) + 24}px` : '0px', opacity: open ? 1 : 0 }}
        >
          <div
            ref={bodyRef}
            className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-[clamp(22px,3vw,44px)] pb-2 pt-4 md:pt-0"
          >
            <Reveal className={`relative overflow-hidden ${reverseOrder ? 'md:order-2' : 'md:order-1'}`}>
              <GhostNumeral
                value={study.index}
                className="-left-[.04em] -top-[.14em] hidden text-[clamp(120px,14vw,220px)] text-ink md:block"
              />
              <div className="relative mb-[14px] hidden font-mono text-[11px] tracking-[.12em] text-red md:block">
                {study.index} / {study.category}
              </div>
              <h2 className="relative m-0 mb-2 hidden font-display text-[clamp(30px,4vw,48px)] font-bold leading-none tracking-[-.04em] text-ink md:block">
                {study.name}
              </h2>
              <p className="m-0 mb-6 font-sora text-[16px] font-light leading-[1.6] text-muted">
                {t(study.summary, locale)}
              </p>
              {study.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={study.image}
                  alt={study.name}
                  className="photo-grade h-[clamp(160px,22vw,260px)] w-full rounded-[20px] object-cover"
                  loading="lazy"
                />
              ) : (
                <PlaceholderPanel
                  label={t(study.imageLabel, locale)}
                  className="h-[clamp(160px,22vw,260px)] rounded-[20px] p-4"
                  labelClassName="px-3 py-2 text-[11px]"
                />
              )}
            </Reveal>
            <Reveal className={`flex flex-col gap-[22px] ${reverseOrder ? 'md:order-1' : 'md:order-2'}`}>
              <div>
                <div className="mb-2 font-mono text-[11px] text-muted">OBJECTIVE</div>
                <p className="m-0 font-sora text-[16px] font-light leading-[1.6] text-ink">{t(study.objective, locale)}</p>
              </div>
              <div>
                <div className="mb-2 font-mono text-[11px] text-muted">WHAT WE DID</div>
                <p className="m-0 font-sora text-[16px] font-light leading-[1.6] text-ink">{t(study.whatWeDid, locale)}</p>
              </div>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-4 border-t border-line pt-5">
                {study.stats.map((stat) => (
                  <div key={stat.label.en}>
                    <StatCounter
                      value={stat.value}
                      decimals={stat.decimals}
                      prefix={stat.prefix}
                      suffix={stat.suffix}
                      className="font-sora text-[clamp(34px,4vw,46px)] font-bold leading-[.9] tracking-[-.04em] text-red"
                    />
                    <div className="mt-2 font-sora text-[13px] font-normal leading-[1.35] text-muted">
                      {t(stat.label, locale)}
                    </div>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}
