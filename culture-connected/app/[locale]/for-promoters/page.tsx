import type { Metadata } from 'next';
import type { Locale } from '@/core/i18n/config';
import { localeHref } from '@/core/i18n/paths';
import { t } from '@/core/i18n/localized';
import { forPromotersContent } from '@/core/content/forPromoters';
import { navItems } from '@/core/content/nav';
import { AccentHeading } from '@/components/ui/AccentHeading';
import { Button } from '@/components/ui/Button';
import { Reveal } from '@/components/ui/Reveal';
import { StatCounter } from '@/components/ui/StatCounter';
import { Marquee } from '@/components/ui/Marquee';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { StatTicket } from '@/components/ui/StatTicket';
import { ContactSection } from '@/components/layout/ContactSection';
import { ObjectivePanels } from '@/components/sections/ObjectivePanels';
import { homeContent } from '@/core/content/home';

function VenueLogoRow() {
  return (
    <div className="flex gap-4 pr-4">
      {homeContent.roster.promoters.chips.map((name, i) => (
        <div
          key={i}
          className="flex h-[46px] w-[160px] flex-none items-center justify-center rounded-full bg-chip"
        >
          <span className="whitespace-nowrap px-3 font-mono text-[10px] uppercase tracking-[.1em] text-muted">
            {name}
          </span>
        </div>
      ))}
    </div>
  );
}

export function generateMetadata({ params }: { params: { locale: Locale } }): Metadata {
  const { locale } = params;
  return { title: `culture connected — ${t(navItems[1].label, locale)}` };
}

export default function ForPromotersPage({ params }: { params: { locale: Locale } }) {
  const { locale } = params;
  const c = forPromotersContent;

  return (
    <>
      <section className="mx-auto max-w-[1440px] px-[clamp(18px,4vw,52px)] pb-[clamp(28px,4vw,48px)] pt-[clamp(48px,7vw,92px)]">
        <div>
          <Reveal className="mb-[clamp(18px,3vw,30px)] font-mono text-[11px] uppercase tracking-[.16em] text-red">
            <Eyebrow>{t(c.eyebrow, locale)}</Eyebrow>
          </Reveal>
          <Reveal>
            <AccentHeading
              heading={c.heading}
              locale={locale}
              className="max-w-[1100px] font-sora text-[clamp(40px,7vw,96px)] font-bold leading-[.95] tracking-[-.05em] text-ink"
            />
          </Reveal>
          <div className="mt-[clamp(24px,3vw,40px)] grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] items-end gap-[clamp(20px,3vw,40px)]">
            <Reveal as="p" className="m-0 max-w-[520px] font-sora text-[17px] font-light leading-[1.6] text-muted">
              {t(c.intro, locale)}
            </Reveal>
            <Reveal className="flex flex-wrap gap-[10px]">
              <Button href="#venue" variant="solid" className="whitespace-nowrap px-6 py-4 text-[14px]">
                {t(c.ctaVenue, locale)}
              </Button>
              <Button href="#venue" variant="outline" className="whitespace-nowrap px-6 py-[15px] text-[14px]">
                {t(c.ctaEvent, locale)}
              </Button>
            </Reveal>
          </div>
          <Reveal className="mt-[clamp(24px,3vw,36px)] flex flex-wrap items-center gap-[10px]">
            <span className="font-mono text-[11px] tracking-[.1em] text-muted">{t(c.venueTypesLabel, locale)}</span>
            {c.venueTypes.map((type) => (
              <span key={type} className="rounded-full bg-chip px-[15px] py-[9px] font-sora text-[13px] text-ink">
                {type}
              </span>
            ))}
          </Reveal>
        </div>
      </section>

      <section id="venue" className="mx-auto max-w-[1440px] px-[clamp(18px,4vw,52px)] pt-[clamp(28px,4vw,48px)]">
        <ObjectivePanels objectiveA={c.objectiveA} objectiveB={c.objectiveB} locale={locale} />
        <Reveal as="p" className="m-0 mt-[18px] max-w-[640px] font-mono text-[11px] font-normal leading-[1.6] text-muted">
          {t(c.provisionalNote, locale)}
        </Reveal>
      </section>

      <section className="mx-auto max-w-[1440px] px-[clamp(18px,4vw,52px)] pt-[clamp(52px,7vw,84px)]">
        <Reveal as="h2" className="mb-[clamp(20px,3vw,32px)] font-sora text-[clamp(28px,3.6vw,40px)] font-bold leading-none tracking-[-.035em] text-ink">
          {t(c.reportHeading, locale)}
        </Reveal>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-4">
          {c.reportItems.map((item, i) => (
            <Reveal key={item.title.en} index={i} className="rounded-2xl bg-surface2 p-[26px]">
              <div className="font-sora text-[17px] font-semibold leading-[1.25] text-ink">{t(item.title, locale)}</div>
              <p className="m-0 mt-2 font-sora text-[14px] font-light leading-[1.55] text-muted">{t(item.body, locale)}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[1440px] px-[clamp(18px,4vw,52px)] pt-[clamp(52px,7vw,84px)]">
        <div className="mb-[clamp(20px,3vw,32px)] flex flex-wrap items-baseline justify-between gap-[14px]">
          <Reveal as="h2" className="font-sora text-[clamp(28px,3.6vw,40px)] font-bold leading-none tracking-[-.035em] text-ink">
            {t(c.proofHeading, locale)}
          </Reveal>
          <span className="font-mono text-[11px] text-muted">{t(c.proofNote, locale)}</span>
        </div>
        <div className="flex flex-wrap items-start gap-4">
          <Reveal
            key={c.proofStats[0].sublabel}
            index={0}
            as="a"
            href={`${localeHref(locale, '/case-studies')}#${c.proofStats[0].anchor}`}
            className="block flex-none no-underline transition-transform duration-150 active:scale-[0.97]"
          >
            <StatTicket
              value={c.proofStats[0].value}
              decimals={c.proofStats[0].decimals}
              suffix={c.proofStats[0].suffix}
              label={t(c.proofStats[0].label, locale)}
              sublabel={c.proofStats[0].sublabel}
            />
          </Reveal>
          {c.proofStats.slice(1).map((stat, i) => (
            <Reveal
              key={stat.sublabel}
              index={i + 1}
              as="a"
              href={`${localeHref(locale, '/case-studies')}#${stat.anchor}`}
              className="block min-w-[220px] flex-1 self-center rounded-3xl bg-surface p-[clamp(24px,3vw,32px)] no-underline transition-transform duration-150 active:scale-[0.97]"
            >
              <StatCounter
                value={stat.value}
                decimals={stat.decimals}
                suffix={stat.suffix}
                className="font-sora text-[clamp(38px,4.4vw,52px)] font-bold leading-[.9] tracking-[-.05em] text-red"
              />
              <div className="mt-[14px] font-sora text-[16px] font-medium leading-[1.3] text-ink">{t(stat.label, locale)}</div>
              <div className="mt-[10px] font-mono text-[11px] text-muted">{stat.sublabel}</div>
            </Reveal>
          ))}
        </div>
      </section>

      <Marquee
        row={<VenueLogoRow />}
        durationClass="animate-marq-32"
        className="mt-[clamp(52px,7vw,84px)] bg-surface py-[22px]"
      />

      <ContactSection locale={locale} heading={c.contactHeading} />
    </>
  );
}
