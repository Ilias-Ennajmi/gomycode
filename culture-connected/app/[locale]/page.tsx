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
import { ProcessSteps } from '@/components/ui/ProcessSteps';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { NumberedRow } from '@/components/ui/NumberedRow';
import { StatRow } from '@/components/ui/StatRow';
import { ContactSection } from '@/components/layout/ContactSection';
import { CaseStudiesPreview } from '@/components/sections/CaseStudiesPreview';
import { PurposeSection } from '@/components/sections/PurposeSection';
import { recordLabels } from '@/core/content/roster';

export function generateMetadata({ params }: { params: { locale: Locale } }): Metadata {
  const { locale } = params;
  return { title: `culture connected — ${t(homeContent.eyebrow, locale)}` };
}

function LogoRow() {
  return (
    <div className="flex items-center gap-4 pr-4">
      {recordLabels.map((label) => (
        <div
          key={label.slug}
          className="flex h-[62px] w-[168px] flex-none items-center justify-center border border-line bg-white px-5 py-2"
          title={label.name}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={label.image} alt={label.name} className="max-h-[38px] max-w-full object-contain" loading="lazy" />
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
          <span className="whitespace-nowrap px-6 font-inter text-[14px] font-medium text-onInv">{word}</span>
          <span className="h-[6px] w-[6px] flex-none rounded-full bg-red" />
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
      <section className="mx-auto grid max-w-[1440px] grid-cols-[repeat(auto-fit,minmax(320px,1fr))] items-end gap-[clamp(24px,4vw,52px)] px-[clamp(18px,4vw,52px)] pb-[clamp(36px,4.6vw,64px)] pt-[clamp(56px,7.6vw,100px)]">
        <div className="min-w-0">
          <Reveal className="mb-[clamp(18px,3vw,32px)] font-mono text-[11px] uppercase tracking-[.16em] text-red">
            <Eyebrow>{t(c.eyebrow, locale)}</Eyebrow>
          </Reveal>
          <Reveal>
            <AccentHeading
              heading={c.heading}
              locale={locale}
              className="text-[clamp(44px,7.8vw,112px)] font-extrabold leading-[.92] tracking-[-.03em] text-ink"
            />
          </Reveal>
        </div>
        <div className="max-w-[420px] pb-[10px]">
          <Reveal as="p" className="m-0 mb-[22px] font-inter text-[16px] font-light leading-[1.55] text-muted">
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
        className="mx-[clamp(18px,4vw,52px)] h-[clamp(160px,46vw,520px)]"
      />

      <Marquee
        row={<LogoRow />}
        durationClass="animate-marq-32"
        className="mt-[clamp(34px,5vw,52px)] border-y border-line bg-surface py-[22px]"
      />

      <section className="mx-auto max-w-[1440px] px-[clamp(18px,4vw,52px)] pt-[clamp(60px,8vw,96px)]">
        <Reveal as="h2" className="mb-[clamp(22px,3vw,32px)] font-display text-[clamp(28px,3.6vw,40px)] font-extrabold leading-[1.02] tracking-[-.025em] text-ink">
          {t(c.whatWeDoHeading, locale)}
        </Reveal>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-x-8 gap-y-6">
          {c.whatWeDo.map((item, i) => (
            <Reveal key={item.label.en} index={i}>
              <NumberedRow
                number={`0${i + 1}`}
                heading={t(item.label, locale)}
                body={
                  <>
                    <span className="font-semibold text-ink">{t(item.bold, locale)}</span> {t(item.rest, locale)}
                  </>
                }
              />
            </Reveal>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[1440px] px-[clamp(18px,4vw,52px)] pt-[clamp(60px,8vw,96px)]">
        <Reveal as="h2" className="mb-[clamp(22px,3vw,32px)] font-display text-[clamp(30px,4.2vw,44px)] font-extrabold leading-[1.02] tracking-[-.03em] text-ink">
          {t(c.pillarsHeading, locale)}
        </Reveal>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-x-8 gap-y-2">
          {c.pillars.map((pillar, i) => (
            <Reveal key={pillar.heading.en} index={i}>
              <NumberedRow
                number={`0${i + 1}`}
                heading={t(pillar.heading, locale)}
                body={t(pillar.body, locale)}
              />
            </Reveal>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[1440px] px-[clamp(18px,4vw,52px)] pt-[clamp(60px,8vw,96px)]">
        <div className="bg-inv p-[clamp(32px,4.4vw,56px)] text-onInv">
          <div className="mb-[clamp(28px,4vw,44px)] flex flex-wrap items-baseline justify-between gap-[14px]">
            <Reveal as="h2" className="font-display text-[clamp(28px,3.6vw,40px)] font-extrabold leading-none tracking-[-.025em]">
              {t(c.proofHeading, locale)}
            </Reveal>
            <Link href={localeHref(locale, '/case-studies')} className="font-mono text-[12px] text-red no-underline">
              {t(c.proofLink, locale)}
            </Link>
          </div>
          <StatRow
            emphasizeFirst
            stats={c.proofStats.map((stat) => ({
              value: stat.value,
              decimals: stat.decimals,
              suffix: stat.suffix,
              label: t(stat.label, locale),
              sublabel: stat.sublabel,
              href: `${localeHref(locale, '/case-studies')}#${stat.anchor}`,
            }))}
          />
        </div>
      </section>

      <Marquee
        row={<TickerRow words={c.serviceWords} />}
        durationClass="animate-marq-30"
        maskClass="marquee-mask-wide"
        className="mt-[clamp(60px,8vw,96px)] bg-inv py-5"
      />

      <section className="mx-auto grid max-w-[1440px] grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-4 px-[clamp(18px,4vw,52px)] pt-[clamp(60px,8vw,96px)]">
        <Reveal className="border border-line p-[clamp(24px,3vw,34px)]">
          <div className="mb-3 font-mono text-[11px] tracking-[.1em] text-red">{t(c.roster.artists.eyebrow, locale)}</div>
          <h3 className="m-0 mb-[22px] font-display text-[clamp(24px,3vw,28px)] font-bold leading-[1.1] tracking-[-.02em] text-ink">
            {t(c.roster.artists.heading, locale)}
          </h3>
          <div className="flex flex-wrap gap-2 font-inter text-[14px]">
            {c.roster.artists.chips.map((chip) => (
              <span key={chip} className="border border-line px-[13px] py-[8px]">
                {chip}
              </span>
            ))}
            <span className="border border-line px-[13px] py-[8px] font-mono text-[11px] text-muted">
              {t(c.roster.moreLabel, locale)}
            </span>
          </div>
        </Reveal>
        <Reveal className="border border-line bg-surface2 p-[clamp(24px,3vw,34px)]">
          <div className="mb-3 font-mono text-[11px] tracking-[.1em] text-muted">{t(c.roster.promoters.eyebrow, locale)}</div>
          <h3 className="m-0 mb-[22px] font-display text-[clamp(24px,3vw,28px)] font-bold leading-[1.1] tracking-[-.02em] text-ink">
            {t(c.roster.promoters.heading, locale)}
          </h3>
          <div className="flex flex-wrap gap-2 font-inter text-[14px]">
            {c.roster.promoters.chips.map((chip) => (
              <span key={chip} className="border border-line px-[13px] py-[8px]">
                {chip}
              </span>
            ))}
            <span className="border border-line px-[13px] py-[8px] font-mono text-[11px] text-muted">
              {t(c.roster.moreLabel, locale)}
            </span>
          </div>
        </Reveal>
      </section>

      <PurposeSection locale={locale} />

      <CaseStudiesPreview locale={locale} />

      <section className="mx-auto max-w-[1440px] px-[clamp(18px,4vw,52px)] pt-[clamp(60px,8vw,96px)]">
        <div className="mb-[clamp(22px,3vw,34px)] flex flex-wrap items-baseline justify-between gap-[14px]">
          <Reveal as="h2" className="font-display text-[clamp(28px,3.6vw,40px)] font-extrabold leading-none tracking-[-.025em] text-ink">
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
