import type { Metadata } from 'next';
import type { Locale } from '@/core/i18n/config';
import { localeHref } from '@/core/i18n/paths';
import { t } from '@/core/i18n/localized';
import { forArtistsContent } from '@/core/content/forArtists';
import { navItems } from '@/core/content/nav';
import { AccentHeading } from '@/components/ui/AccentHeading';
import { Button } from '@/components/ui/Button';
import { HeroMediaPanel } from '@/components/ui/HeroMediaPanel';
import { Reveal } from '@/components/ui/Reveal';
import { Marquee } from '@/components/ui/Marquee';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { NumberedRow } from '@/components/ui/NumberedRow';
import { ExpandableList } from '@/components/ui/ExpandableList';
import { StatRow } from '@/components/ui/StatRow';
import { ContactSection } from '@/components/layout/ContactSection';
import { PurposeSection } from '@/components/sections/PurposeSection';
import { artistRoster } from '@/core/content/roster';

function ArtistRow() {
  return (
    <div className="flex items-center gap-8 pr-8">
      {artistRoster.map((artist) => (
        <span key={artist.slug} className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={artist.image}
            alt={artist.name}
            className="h-10 w-10 flex-none rounded-full object-cover"
            loading="lazy"
          />
          <span className="whitespace-nowrap font-inter text-[14px] font-medium text-ink">{artist.name}</span>
        </span>
      ))}
    </div>
  );
}

export function generateMetadata({ params }: { params: { locale: Locale } }): Metadata {
  const { locale } = params;
  return { title: `culture connected — ${t(navItems[0].label, locale)}` };
}

export default function ForArtistsPage({ params }: { params: { locale: Locale } }) {
  const { locale } = params;
  const c = forArtistsContent;

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
              <Button href="#contact" variant="solid" className="px-6 py-4 text-[14px]">
                {t(c.ctaPrimary, locale)}
              </Button>
              <Button href={localeHref(locale, '/case-studies')} variant="outline" className="px-6 py-[15px] text-[14px]">
                {t(c.ctaSecondary, locale)}
              </Button>
            </Reveal>
          </div>
        </div>
      </section>

      <HeroMediaPanel
        label={t(c.mediaLabel, locale)}
        className="mx-[clamp(18px,4vw,52px)] h-[clamp(140px,34vw,400px)]"
      />

      <section className="mx-auto max-w-[1440px] px-[clamp(18px,4vw,52px)] pt-[clamp(60px,8vw,96px)]">
        <Reveal as="h2" className="mb-[clamp(22px,3vw,34px)] font-display text-[clamp(28px,3.8vw,44px)] font-extrabold leading-[1.02] tracking-[-.03em] text-ink">
          {t(c.handleHeading, locale)}
        </Reveal>
        <ExpandableList
          initialCount={4}
          seeAllLabel={locale === 'fr' ? `Voir les ${c.handleItems.length} →` : `See all ${c.handleItems.length} →`}
          gridClassName="grid grid-cols-1 gap-x-8 gap-y-1 md:grid-cols-2"
          items={c.handleItems.map((item, i) => (
            <Reveal key={item.number} index={i}>
              <NumberedRow number={item.number} heading={t(item.heading, locale)} body={t(item.body, locale)} />
            </Reveal>
          ))}
        />
      </section>

      <PurposeSection locale={locale} />

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

      <Marquee
        row={<ArtistRow />}
        durationClass="animate-marq-32"
        className="mt-[clamp(60px,8vw,96px)] border-y border-line bg-surface py-[22px]"
      />

      <ContactSection locale={locale} heading={c.contactHeading} />
    </>
  );
}
