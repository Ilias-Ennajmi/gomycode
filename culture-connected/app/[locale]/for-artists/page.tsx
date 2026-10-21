import type { Metadata } from 'next';
import type { Locale } from '@/core/i18n/config';
import { localeHref } from '@/core/i18n/paths';
import { t } from '@/core/i18n/localized';
import { forArtistsContent } from '@/core/content/forArtists';
import { navItems } from '@/core/content/nav';
import { AccentHeading } from '@/components/ui/AccentHeading';
import { Button } from '@/components/ui/Button';
import { Reveal } from '@/components/ui/Reveal';
import { Marquee } from '@/components/ui/Marquee';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { HoverHeading } from '@/components/ui/HoverHeading';
import { CardCarousel } from '@/components/ui/CardCarousel';
import { ContactSection } from '@/components/layout/ContactSection';
import { PurposeSection } from '@/components/sections/PurposeSection';
import { ProofShowcase } from '@/components/sections/ProofShowcase';
import { ArtistHeroCarousel } from '@/components/sections/ArtistHeroCarousel';
import { artistRoster, recordLabels } from '@/core/content/roster';

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
  return { title: `culture connected — ${t(navItems[1].label, locale)}` };
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

      <ArtistHeroCarousel prevLabel={t(c.heroPrev, locale)} nextLabel={t(c.heroNext, locale)} />

      <section className="mx-auto max-w-[1440px] px-[clamp(18px,4vw,52px)] pt-[clamp(60px,8vw,96px)]">
        <HoverHeading className="mb-[clamp(22px,3vw,34px)] font-display text-[clamp(28px,3.8vw,44px)] font-extrabold leading-[1.02] tracking-[-.03em] text-ink">
          {t(c.handleHeading, locale)}
        </HoverHeading>
        <CardCarousel
          prevLabel={t(c.handlePrev, locale)}
          nextLabel={t(c.handleNext, locale)}
          cardClassName="w-[clamp(240px,32vw,360px)]"
          items={c.handleItems.map((item, i) => (
            <Reveal
              key={item.number}
              index={i}
              className="h-full cursor-default border border-line p-[22px] transition-all duration-200 hover:-translate-y-[2px] hover:border-ink hover:bg-chip"
            >
              <div className="mb-[10px] font-mono text-[11px] text-muted">{item.number}</div>
              <h3 className="m-0 mb-2 font-inter text-[18px] font-semibold leading-[1.25] tracking-[-.01em] text-ink md:text-[20px]">
                {t(item.heading, locale)}
              </h3>
              <p className="m-0 font-inter text-[14px] font-light leading-[1.6] text-muted md:text-[15px]">
                {t(item.body, locale)}
              </p>
            </Reveal>
          ))}
        />
      </section>

      <PurposeSection locale={locale} />

      <section className="mx-auto max-w-[1440px] px-[clamp(18px,4vw,52px)] pt-[clamp(60px,8vw,96px)]">
        <ProofShowcase locale={locale} pool={c.proofPool} heading={c.proofHeading} note={c.proofNote} variant="light" />
      </section>

      <section className="mx-auto max-w-[1440px] px-[clamp(18px,4vw,52px)] pt-[clamp(60px,8vw,96px)]">
        <HoverHeading className="mb-[clamp(18px,2.6vw,26px)] font-display text-[clamp(24px,3vw,30px)] font-extrabold leading-[1.05] tracking-[-.02em] text-ink">
          {t(c.labelsHeading, locale)}
        </HoverHeading>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-x-4 gap-y-4">
          {recordLabels.map((label, i) => (
            <Reveal
              key={label.slug}
              index={i % 8}
              className="flex h-[60px] cursor-default items-center justify-center border border-line bg-white px-4 transition-all duration-200 hover:-translate-y-[2px] hover:border-ink"
              title={label.name}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={label.image} alt={label.name} className="max-h-[34px] max-w-full object-contain" loading="lazy" />
            </Reveal>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[1440px] px-[clamp(18px,4vw,52px)] pt-[clamp(60px,8vw,96px)]">
        <HoverHeading className="mb-[clamp(18px,2.6vw,26px)] font-display text-[clamp(24px,3vw,30px)] font-extrabold leading-[1.05] tracking-[-.02em] text-ink">
          {t(c.spotifyHeading, locale)}
        </HoverHeading>
        {c.spotifyPlaylistUrl ? (
          <iframe
            title="Spotify playlist"
            src={c.spotifyPlaylistUrl}
            className="h-[352px] w-full max-w-[760px] border-0"
            loading="lazy"
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          />
        ) : (
          <div className="placeholder-stripes flex h-[180px] max-w-[760px] items-end p-4">
            <span className="border border-current bg-bg px-3 py-2 font-mono text-[11px] text-muted">
              {t(c.spotifyNote, locale)}
            </span>
          </div>
        )}
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
