import type { Metadata } from 'next';
import type { Locale } from '@/core/i18n/config';
import { localeHref } from '@/core/i18n/paths';
import { t } from '@/core/i18n/localized';
import { forPromotersContent } from '@/core/content/forPromoters';
import { navItems } from '@/core/content/nav';
import { AccentHeading } from '@/components/ui/AccentHeading';
import { Button } from '@/components/ui/Button';
import { Reveal } from '@/components/ui/Reveal';
import { Marquee } from '@/components/ui/Marquee';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { NumberedRow } from '@/components/ui/NumberedRow';
import { ExpandableList } from '@/components/ui/ExpandableList';
import { StatRow } from '@/components/ui/StatRow';
import { ContactSection } from '@/components/layout/ContactSection';
import { ObjectivePanels } from '@/components/sections/ObjectivePanels';
import { venueRoster } from '@/core/content/roster';

function VenueLogoRow() {
  return (
    <div className="flex items-center gap-4 pr-4">
      {venueRoster.map((venue) => (
        <div
          key={venue.slug}
          className="flex h-[58px] w-[172px] flex-none items-center justify-center overflow-hidden border border-line bg-chip px-4"
          title={venue.name}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={venue.image} alt={venue.name} className="max-h-[42px] max-w-full object-contain" loading="lazy" />
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
      <section className="mx-auto max-w-[1440px] px-[clamp(18px,4vw,52px)] pb-[clamp(28px,4vw,48px)] pt-[clamp(56px,7.6vw,100px)]">
        <div>
          <Reveal className="mb-[clamp(18px,3vw,30px)] font-mono text-[11px] uppercase tracking-[.16em] text-red">
            <Eyebrow>{t(c.eyebrow, locale)}</Eyebrow>
          </Reveal>
          <Reveal>
            <AccentHeading
              heading={c.heading}
              locale={locale}
              className="max-w-[1100px] text-[clamp(42px,7.2vw,100px)] font-extrabold leading-[.94] tracking-[-.03em] text-ink"
            />
          </Reveal>
          <div className="mt-[clamp(24px,3vw,40px)] grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] items-end gap-[clamp(20px,3vw,40px)]">
            <Reveal as="p" className="m-0 max-w-[520px] font-inter text-[17px] font-light leading-[1.6] text-muted">
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
              <span key={type} className="border border-line px-[13px] py-[8px] font-inter text-[13px] text-ink">
                {type}
              </span>
            ))}
          </Reveal>
        </div>
      </section>

      <section id="venue" className="mx-auto max-w-[1440px] px-[clamp(18px,4vw,52px)] pt-[clamp(28px,4vw,48px)]">
        <ObjectivePanels objectiveA={c.objectiveA} objectiveB={c.objectiveB} locale={locale} />
      </section>

      <section className="mx-auto max-w-[1440px] px-[clamp(18px,4vw,52px)] pt-[clamp(60px,8vw,96px)]">
        <Reveal as="h2" className="m-0 font-display text-[clamp(26px,3.2vw,36px)] font-extrabold leading-[1.05] tracking-[-.02em] text-ink">
          {t(c.tacticsHeading, locale)}
        </Reveal>
        <Reveal as="p" className="m-0 mt-2 font-inter text-[16px] font-medium leading-[1.4] text-muted">
          {t(c.tacticsIntro, locale)}
        </Reveal>
        <div className="mt-[clamp(20px,2.8vw,30px)]">
          <ExpandableList
            initialCount={4}
            seeAllLabel={locale === 'fr' ? `Voir les ${c.tactics.length} →` : `See all ${c.tactics.length} →`}
            gridClassName="grid list-none grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-x-8 gap-y-3"
            items={c.tactics.map((tactic, i) => (
              <Reveal
                key={tactic.en}
                index={i}
                className="flex gap-3 border-t border-line pt-3 font-inter text-[14px] font-light leading-[1.5] text-ink"
              >
                <span className="text-red">→</span>
                <span>{t(tactic, locale)}</span>
              </Reveal>
            ))}
          />
        </div>
      </section>

      <section className="mx-auto max-w-[1440px] px-[clamp(18px,4vw,52px)] pt-[clamp(60px,8vw,96px)]">
        <Reveal as="h2" className="mb-[clamp(22px,3vw,32px)] font-display text-[clamp(28px,3.6vw,40px)] font-extrabold leading-none tracking-[-.025em] text-ink">
          {t(c.reportHeading, locale)}
        </Reveal>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-x-8 gap-y-2">
          {c.reportItems.map((item, i) => (
            <Reveal key={item.title.en} index={i}>
              <NumberedRow number={`0${i + 1}`} heading={t(item.title, locale)} body={t(item.body, locale)} />
            </Reveal>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[1440px] px-[clamp(18px,4vw,52px)] pt-[clamp(60px,8vw,96px)]">
        <div className="mb-[clamp(28px,4vw,44px)] flex flex-wrap items-baseline justify-between gap-[14px]">
          <Reveal as="h2" className="font-display text-[clamp(28px,3.6vw,40px)] font-extrabold leading-none tracking-[-.025em] text-ink">
            {t(c.proofHeading, locale)}
          </Reveal>
          <span className="font-mono text-[11px] text-muted">{t(c.proofNote, locale)}</span>
        </div>
        <StatRow
          stats={c.proofStats.map((stat) => ({
            value: stat.value,
            decimals: stat.decimals,
            suffix: stat.suffix,
            label: t(stat.label, locale),
            sublabel: stat.sublabel,
            href: `${localeHref(locale, '/case-studies')}#${stat.anchor}`,
          }))}
        />
      </section>

      <section className="mx-auto max-w-[1440px] px-[clamp(18px,4vw,52px)] pt-[clamp(60px,8vw,96px)]">
        <Reveal as="h2" className="font-display text-[clamp(28px,3.6vw,40px)] font-extrabold leading-none tracking-[-.025em] text-ink">
          {t(c.venuesHeading, locale)}
        </Reveal>
        <Reveal as="p" className="m-0 mt-3 max-w-[560px] font-inter text-[13px] font-light leading-[1.5] text-muted">
          {t(c.venuesNote, locale)}
        </Reveal>
        <div className="mt-[clamp(22px,3vw,32px)] grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-x-4 gap-y-[clamp(20px,2.6vw,28px)]">
          {venueRoster.map((venue, i) => {
            const flagship = venue.slug === 'umbra' || venue.slug === 'eden-nightclub';
            return (
              <Reveal key={venue.slug} index={i % 8} className="flex flex-col items-center text-center">
                <div
                  className={`flex items-center justify-center overflow-hidden rounded-full bg-chip ${
                    flagship ? 'h-[96px] w-[96px] p-4' : 'h-[76px] w-[76px] p-3'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={venue.image} alt={venue.name} className="h-full w-full object-contain" loading="lazy" />
                </div>
                <div className="mt-3 font-inter text-[13px] font-semibold leading-[1.25] text-ink">{venue.name}</div>
                {venue.location ? (
                  <div className="mt-1 font-mono text-[10px] uppercase tracking-[.08em] text-muted">{venue.location}</div>
                ) : null}
              </Reveal>
            );
          })}
        </div>
      </section>

      <Marquee
        row={<VenueLogoRow />}
        durationClass="animate-marq-32"
        className="mt-[clamp(60px,8vw,96px)] border-y border-line bg-surface py-[22px]"
      />

      <ContactSection locale={locale} heading={c.contactHeading} />
    </>
  );
}
