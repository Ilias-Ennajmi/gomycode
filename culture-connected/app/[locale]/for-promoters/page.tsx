import type { Metadata } from 'next';
import type { Locale } from '@/core/i18n/config';
import { t } from '@/core/i18n/localized';
import { forPromotersContent } from '@/core/content/forPromoters';
import { navItems } from '@/core/content/nav';
import { AccentHeading } from '@/components/ui/AccentHeading';
import { Button } from '@/components/ui/Button';
import { Reveal } from '@/components/ui/Reveal';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { ProcessSteps } from '@/components/ui/ProcessSteps';
import { HoverHeading } from '@/components/ui/HoverHeading';
import { CardCarousel } from '@/components/ui/CardCarousel';
import { ContactSection } from '@/components/layout/ContactSection';
import { ObjectivePanels } from '@/components/sections/ObjectivePanels';
import { ProofShowcase } from '@/components/sections/ProofShowcase';
import { EventMotionCarousel } from '@/components/sections/EventMotionCarousel';
import { venueRoster } from '@/core/content/roster';

export function generateMetadata({ params }: { params: { locale: Locale } }): Metadata {
  const { locale } = params;
  return { title: `culture connected — ${t(navItems[2].label, locale)}` };
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
        <HoverHeading className="font-display text-[clamp(26px,3.2vw,36px)] font-extrabold leading-[1.05] tracking-[-.02em] text-ink">
          {t(c.tacticsHeading, locale)}
        </HoverHeading>
        <Reveal as="p" className="m-0 mt-2 font-inter text-[16px] font-medium leading-[1.4] text-muted">
          {t(c.tacticsIntro, locale)}
        </Reveal>
        <div className="mt-[clamp(20px,2.8vw,30px)] grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
          {c.tactics.map((tactic, i) => (
            <Reveal
              key={tactic.number}
              index={i}
              className="cursor-default border border-line p-[20px] transition-all duration-200 hover:-translate-y-[2px] hover:border-ink hover:bg-chip"
            >
              <div className="mb-[10px] font-mono text-[11px] text-red">{tactic.number}</div>
              <p className="m-0 font-inter text-[15px] font-light leading-[1.55] text-ink">{t(tactic.body, locale)}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[1440px] px-[clamp(18px,4vw,52px)] pt-[clamp(60px,8vw,96px)]">
        <HoverHeading className="mb-[clamp(22px,3vw,32px)] font-display text-[clamp(28px,3.6vw,40px)] font-extrabold leading-none tracking-[-.025em] text-ink">
          {t(c.reportHeading, locale)}
        </HoverHeading>
        <ProcessSteps
          steps={c.reportItems.map((item, i) => ({ step: `0${i + 1}`, title: item.title, body: item.body }))}
          locale={locale}
          firstAccent
          gridClassName="grid-cols-[repeat(auto-fit,minmax(240px,1fr))]"
        />
      </section>

      <section className="mx-auto max-w-[1440px] px-[clamp(18px,4vw,52px)] pt-[clamp(60px,8vw,96px)]">
        <ProofShowcase locale={locale} pool={c.proofPool} heading={c.proofHeading} note={c.proofNote} variant="light" />
      </section>

      <section className="mx-auto max-w-[1440px] px-[clamp(18px,4vw,52px)] pt-[clamp(60px,8vw,96px)]">
        <HoverHeading className="font-display text-[clamp(28px,3.6vw,40px)] font-extrabold leading-none tracking-[-.025em] text-ink">
          {t(c.venuesHeading, locale)}
        </HoverHeading>
        <Reveal as="p" className="m-0 mb-[clamp(20px,2.8vw,28px)] mt-3 max-w-[560px] font-inter text-[13px] font-light leading-[1.5] text-muted">
          {t(c.venuesNote, locale)}
        </Reveal>
        <CardCarousel
          prevLabel={t(c.venuesPrev, locale)}
          nextLabel={t(c.venuesNext, locale)}
          cardClassName="w-[clamp(120px,16vw,150px)]"
          items={venueRoster.map((venue) => (
            <div key={venue.slug} className="group flex flex-col items-center text-center">
              <div className="flex h-[76px] w-[76px] cursor-default items-center justify-center overflow-hidden rounded-full bg-chip p-3 transition-transform duration-200 group-hover:scale-[1.08]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={venue.image} alt={venue.name} className="h-full w-full object-contain" loading="lazy" />
              </div>
              <div className="mt-3 font-inter text-[13px] font-semibold leading-[1.25] text-ink">{venue.name}</div>
              {venue.location ? (
                <div className="mt-1 font-mono text-[10px] uppercase tracking-[.08em] text-muted">{venue.location}</div>
              ) : null}
            </div>
          ))}
        />
      </section>

      <section className="mx-auto max-w-[1440px] px-[clamp(18px,4vw,52px)] pt-[clamp(60px,8vw,96px)]">
        <HoverHeading className="mb-[clamp(20px,2.8vw,28px)] font-display text-[clamp(28px,3.6vw,40px)] font-extrabold leading-none tracking-[-.025em] text-ink">
          {t(c.eventsHeading, locale)}
        </HoverHeading>
        <EventMotionCarousel
          prevLabel={t(c.eventsPrev, locale)}
          nextLabel={t(c.eventsNext, locale)}
          placeholderLabel={t(c.eventsPlaceholderLabel, locale)}
        />
      </section>

      <ContactSection locale={locale} heading={c.contactHeading} />
    </>
  );
}
