import type { Metadata } from 'next';
import Link from 'next/link';
import type { Locale } from '@/core/i18n/config';
import { localeHref } from '@/core/i18n/paths';
import { t } from '@/core/i18n/localized';
import { homeContent } from '@/core/content/home';
import { AccentHeading } from '@/components/ui/AccentHeading';
import { Button } from '@/components/ui/Button';
import { HeroMediaPanel } from '@/components/ui/HeroMediaPanel';
import { Marquee } from '@/components/ui/Marquee';
import { Reveal } from '@/components/ui/Reveal';
import { StatCounter } from '@/components/ui/StatCounter';
import { ProcessSteps } from '@/components/ui/ProcessSteps';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { Watermark } from '@/components/ui/Watermark';
import { ContactSection } from '@/components/layout/ContactSection';
import { PillarMarker } from '@/components/sections/PillarMarker';
import { CaseStudiesPreview } from '@/components/sections/CaseStudiesPreview';
import { PurposeSection } from '@/components/sections/PurposeSection';

export function generateMetadata({ params }: { params: { locale: Locale } }): Metadata {
  const { locale } = params;
  return { title: `culture connected — ${t(homeContent.eyebrow, locale)}` };
}

const LOGO_COUNT = 8;

function LogoRow() {
  return (
    <div className="flex gap-4 pr-4">
      {Array.from({ length: LOGO_COUNT }).map((_, i) => (
        <div
          key={i}
          className="flex h-[46px] w-[138px] flex-none items-center justify-center rounded-full bg-chip"
        >
          <span className="font-mono text-[10px] tracking-[.12em] text-muted">LOGO</span>
        </div>
      ))}
    </div>
  );
}

function TickerRow({ words }: { words: string[] }) {
  return (
    <div className="flex items-center">
      {words.map((word, i) => (
        <span key={i} className="flex items-center">
          <span className="whitespace-nowrap px-6 font-sora text-[14px] font-medium text-white">{word}</span>
          <span className="h-[6px] w-[6px] flex-none rounded-full bg-white/[.55]" />
        </span>
      ))}
    </div>
  );
}

export default function HomePage({ params }: { params: { locale: Locale } }) {
  const { locale } = params;
  const c = homeContent;

  return (
    <>
      <section className="relative mx-auto grid max-w-[1440px] grid-cols-[repeat(auto-fit,minmax(320px,1fr))] items-end gap-[clamp(24px,4vw,52px)] overflow-hidden px-[clamp(18px,4vw,52px)] pb-[clamp(32px,4vw,58px)] pt-[clamp(48px,7vw,92px)]">
        <Watermark className="bottom-0 left-[clamp(18px,4vw,52px)]">{t(c.heading.accent, locale)}</Watermark>
        <div className="relative z-10 min-w-0">
          <Reveal className="mb-[clamp(18px,3vw,32px)] font-mono text-[11px] uppercase tracking-[.16em] text-red">
            <Eyebrow>{t(c.eyebrow, locale)}</Eyebrow>
          </Reveal>
          <Reveal>
            <AccentHeading
              heading={c.heading}
              locale={locale}
              className="font-sora text-[clamp(42px,7.6vw,104px)] font-bold leading-[.94] tracking-[-.05em] text-ink"
            />
          </Reveal>
        </div>
        <div className="relative z-10 max-w-[420px] pb-[10px]">
          <Reveal
            as="p"
            className="m-0 mb-[22px] font-sora text-[16px] font-light leading-[1.55] text-muted"
          >
            {t(c.intro, locale)}
          </Reveal>
          <Reveal className="flex flex-col gap-[9px]">
            <Button
              href={localeHref(locale, '/for-artists')}
              variant="solid"
              className="px-[18px] py-[15px] text-center text-[13px]"
            >
              {t(c.ctaPrimary, locale)}
            </Button>
            <Button
              href={localeHref(locale, '/for-promoters')}
              variant="outline"
              className="px-[18px] py-[14px] text-center text-[13px]"
            >
              {t(c.ctaSecondary, locale)}
            </Button>
          </Reveal>
        </div>
      </section>

      <HeroMediaPanel
        label={t(c.heroMediaLabel, locale)}
        className="mx-[clamp(18px,4vw,52px)] h-[clamp(160px,46vw,520px)] rounded-[clamp(18px,3vw,28px)]"
      />

      <Marquee
        row={<LogoRow />}
        durationClass="animate-marq-32"
        className="mt-[clamp(34px,5vw,52px)] bg-surface py-[22px]"
      />

      <section className="mx-auto max-w-[1440px] px-[clamp(18px,4vw,52px)] pt-[clamp(52px,7vw,84px)]">
        <Reveal as="h2" className="mb-[clamp(22px,3vw,32px)] font-sora text-[clamp(30px,4.2vw,44px)] font-bold leading-[1.05] tracking-[-.035em] text-ink">
          {t(c.pillarsHeading, locale)}
        </Reveal>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-4">
          {c.pillars.map((pillar, i) => (
            <Reveal
              key={pillar.heading.en}
              index={i}
              className={`rounded-3xl bg-surface p-[clamp(24px,3vw,32px)] ${i % 2 === 1 ? 'lg:translate-y-6' : ''}`}
            >
              <PillarMarker marker={pillar.marker} />
              <h3 className="m-0 mb-[10px] font-sora text-[23px] font-semibold leading-[1.15] tracking-[-.02em] text-ink">
                {t(pillar.heading, locale)}
              </h3>
              <p className="m-0 font-sora text-[15px] font-light leading-[1.6] text-muted">{t(pillar.body, locale)}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[1440px] px-[clamp(18px,4vw,52px)] pt-[clamp(52px,7vw,84px)]">
        <div className="rounded-[clamp(20px,3vw,30px)] bg-inv p-[clamp(28px,4vw,48px)] text-onInv">
          <div className="mb-[clamp(24px,3vw,36px)] flex flex-wrap items-baseline justify-between gap-[14px]">
            <Reveal as="h2" className="font-sora text-[clamp(28px,3.6vw,40px)] font-bold leading-none tracking-[-.035em]">
              {t(c.proofHeading, locale)}
            </Reveal>
            <Link href={localeHref(locale, '/case-studies')} className="font-mono text-[12px] text-red no-underline">
              {t(c.proofLink, locale)}
            </Link>
          </div>
          <div className="flex flex-wrap gap-7 lg:flex-nowrap">
            {c.proofStats.map((stat, i) => (
              <Reveal
                key={stat.sublabel}
                index={i}
                as={Link}
                href={`${localeHref(locale, '/case-studies')}#${stat.anchor}`}
                className={`block min-w-[180px] flex-1 text-inherit no-underline ${i % 2 === 1 ? 'lg:-ml-6 lg:mt-8' : ''}`}
              >
                <StatCounter
                  value={stat.value}
                  decimals={stat.decimals}
                  suffix={stat.suffix}
                  className="font-sora text-[clamp(52px,8vw,104px)] font-bold leading-[.85] tracking-[-.05em] text-red"
                />
                <div className="mt-[14px] font-sora text-[15px] font-medium leading-[1.35]">{t(stat.label, locale)}</div>
                <div className="mt-2 font-mono text-[11px] opacity-50">{stat.sublabel}</div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <Marquee
        row={<TickerRow words={c.serviceWords} />}
        durationClass="animate-marq-30"
        maskClass="marquee-mask-wide"
        className="mt-[clamp(52px,7vw,84px)] bg-red py-5"
      />

      <section className="mx-auto grid max-w-[1440px] grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-4 px-[clamp(18px,4vw,52px)] pt-[clamp(52px,7vw,84px)]">
        <Reveal className="rounded-3xl bg-surface p-[clamp(24px,3vw,34px)]">
          <div className="mb-3 font-mono text-[11px] tracking-[.1em] text-red">{t(c.roster.artists.eyebrow, locale)}</div>
          <h3 className="m-0 mb-[22px] font-sora text-[clamp(24px,3vw,28px)] font-semibold leading-[1.1] tracking-[-.03em] text-ink">
            {t(c.roster.artists.heading, locale)}
          </h3>
          <div className="flex flex-wrap gap-2 font-sora text-[14px]">
            {c.roster.artists.chips.map((chip) => (
              <span key={chip} className="rounded-full bg-chip px-[15px] py-[10px]">
                {chip}
              </span>
            ))}
            <span className="rounded-full bg-chip px-[15px] py-[10px] font-mono text-[11px] opacity-55">
              {t(c.roster.moreLabel, locale)}
            </span>
          </div>
        </Reveal>
        <Reveal className="rounded-3xl bg-surface2 p-[clamp(24px,3vw,34px)]">
          <div className="mb-3 font-mono text-[11px] tracking-[.1em] text-muted">{t(c.roster.promoters.eyebrow, locale)}</div>
          <h3 className="m-0 mb-[22px] font-sora text-[clamp(24px,3vw,28px)] font-semibold leading-[1.1] tracking-[-.03em] text-ink">
            {t(c.roster.promoters.heading, locale)}
          </h3>
          <div className="flex flex-wrap gap-2 font-sora text-[14px]">
            {c.roster.promoters.chips.map((chip) => (
              <span key={chip} className="rounded-full bg-surface px-[15px] py-[10px]">
                {chip}
              </span>
            ))}
            <span className="rounded-full bg-surface px-[15px] py-[10px] font-mono text-[11px] opacity-55">
              {t(c.roster.moreLabel, locale)}
            </span>
          </div>
        </Reveal>
      </section>

      <PurposeSection locale={locale} />

      <CaseStudiesPreview locale={locale} />

      <section className="mx-auto max-w-[1440px] px-[clamp(18px,4vw,52px)] pt-[clamp(52px,7vw,84px)]">
        <div className="mb-[clamp(22px,3vw,34px)] flex flex-wrap items-baseline justify-between gap-[14px]">
          <Reveal as="h2" className="font-sora text-[clamp(28px,3.6vw,40px)] font-bold leading-none tracking-[-.035em] text-ink">
            {t(c.processHeading, locale)}
          </Reveal>
          <Link href={`${localeHref(locale, '/about')}#process`} className="font-mono text-[12px] text-red no-underline">
            {t(c.processLink, locale)}
          </Link>
        </div>
        <ProcessSteps
          steps={c.processSteps}
          locale={locale}
          firstAccent
          gridClassName="grid-cols-[repeat(auto-fit,minmax(210px,1fr))]"
        />
      </section>

      <ContactSection locale={locale} heading={c.contactHeading} />
    </>
  );
}
