'use client';

import { useState } from 'react';
import { t } from '@/core/i18n/localized';
import type { Locale } from '@/core/i18n/config';
import type { Localized } from '@/core/i18n/localized';
import { Reveal } from '../ui/Reveal';

interface ObjectiveRowData {
  number: string;
  title: Localized;
  body: Localized;
}

interface ObjectiveData {
  eyebrow: Localized;
  heading: Localized;
  body: Localized;
  rows: ObjectiveRowData[];
}

function ObjectiveRow({ number, title, body, locale, muted }: ObjectiveRowData & { locale: Locale; muted?: boolean }) {
  return (
    <div className="flex gap-[14px] border-t border-line pt-3">
      <span className="font-mono text-[11px] leading-[1.6] text-red">{number}</span>
      <div>
        <div className="font-inter text-[15px] font-semibold leading-[1.3]">{t(title, locale)}</div>
        <div className={`font-inter text-[14px] font-light leading-[1.5] ${muted ? 'opacity-[.62]' : 'text-muted'}`}>
          {t(body, locale)}
        </div>
      </div>
    </div>
  );
}

/**
 * Two objective panels that stack to ~1400px on mobile if both are shown at
 * once. Mobile gets a local tab switch (defaults to "Venue") so only one
 * panel renders at a time; desktop keeps the original side-by-side layout
 * regardless of tab state via the `hidden md:block` override.
 */
export function ObjectivePanels({
  objectiveA,
  objectiveB,
  locale,
}: {
  objectiveA: ObjectiveData;
  objectiveB: ObjectiveData;
  locale: Locale;
}) {
  const [tab, setTab] = useState<'venue' | 'event'>('venue');

  return (
    <>
      <div className="mb-4 flex border border-line font-mono text-[11px] uppercase tracking-[.1em] md:hidden">
        <button
          type="button"
          onClick={() => setTab('venue')}
          aria-pressed={tab === 'venue'}
          className={`flex-1 cursor-pointer border-none px-[15px] py-[13px] transition-colors active:scale-[0.98] ${
            tab === 'venue' ? 'bg-inv text-onInv' : 'bg-transparent text-muted'
          }`}
        >
          Venue
        </button>
        <button
          type="button"
          onClick={() => setTab('event')}
          aria-pressed={tab === 'event'}
          className={`flex-1 cursor-pointer border-none px-[15px] py-[13px] transition-colors active:scale-[0.98] ${
            tab === 'event' ? 'bg-inv text-onInv' : 'bg-transparent text-muted'
          }`}
        >
          Event
        </button>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-4">
        <Reveal
          className={`bg-surface p-[clamp(26px,3.4vw,40px)] ${tab === 'event' ? 'hidden md:block' : ''}`}
        >
          <div className="mb-[14px] font-mono text-[11px] tracking-[.1em] text-red">{t(objectiveA.eyebrow, locale)}</div>
          <h2 className="m-0 mb-[14px] font-display text-[clamp(26px,3.2vw,36px)] font-bold leading-[1.05] tracking-[-.025em] text-ink">
            {t(objectiveA.heading, locale)}
          </h2>
          <p className="m-0 mb-[26px] font-inter text-[15px] font-light leading-[1.6] text-muted">
            {t(objectiveA.body, locale)}
          </p>
          <div className="flex flex-col gap-3">
            {objectiveA.rows.map((row) => (
              <ObjectiveRow key={row.number} {...row} locale={locale} />
            ))}
          </div>
        </Reveal>
        <Reveal
          id="event"
          className={`bg-inv p-[clamp(26px,3.4vw,40px)] text-onInv ${tab === 'venue' ? 'hidden md:block' : ''}`}
        >
          <div className="mb-[14px] font-mono text-[11px] tracking-[.1em] text-red">{t(objectiveB.eyebrow, locale)}</div>
          <h2 className="m-0 mb-[14px] font-display text-[clamp(26px,3.2vw,36px)] font-bold leading-[1.05] tracking-[-.025em]">
            {t(objectiveB.heading, locale)}
          </h2>
          <p className="m-0 mb-[26px] font-inter text-[15px] font-light leading-[1.6] opacity-[.68]">
            {t(objectiveB.body, locale)}
          </p>
          <div className="flex flex-col gap-3">
            {objectiveB.rows.map((row) => (
              <ObjectiveRow key={row.number} {...row} locale={locale} muted />
            ))}
          </div>
        </Reveal>
      </div>
    </>
  );
}
