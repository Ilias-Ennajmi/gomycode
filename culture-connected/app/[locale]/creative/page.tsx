import type { Metadata } from 'next';
import type { Locale } from '@/core/i18n/config';
import { localeHref } from '@/core/i18n/paths';
import { t } from '@/core/i18n/localized';
import { creativeContent } from '@/core/content/creative';
import { navItems } from '@/core/content/nav';
import { AccentHeading } from '@/components/ui/AccentHeading';
import { Button } from '@/components/ui/Button';
import { Reveal } from '@/components/ui/Reveal';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { HoverHeading } from '@/components/ui/HoverHeading';
import { ContactSection } from '@/components/layout/ContactSection';
import { VideoPlayerSection } from '@/components/sections/VideoPlayerSection';

export function generateMetadata({ params }: { params: { locale: Locale } }): Metadata {
  const { locale } = params;
  return { title: `culture connected — ${t(navItems[3].label, locale)}` };
}

export default function CreativePage({ params }: { params: { locale: Locale } }) {
  const { locale } = params;
  const c = creativeContent;

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

      <VideoPlayerSection
        prevLabel={t(c.videoPrev, locale)}
        nextLabel={t(c.videoNext, locale)}
        placeholderLabel={t(c.videoPlaceholderLabel, locale)}
        className="mx-[clamp(18px,4vw,52px)]"
      />

      <section className="mx-auto max-w-[1440px] px-[clamp(18px,4vw,52px)] pt-[clamp(60px,8vw,96px)]">
        <HoverHeading className="mb-[clamp(22px,3vw,34px)] font-display text-[clamp(28px,3.8vw,44px)] font-extrabold leading-[1.02] tracking-[-.03em] text-ink">
          {t(c.servicesHeading, locale)}
        </HoverHeading>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {c.services.map((item, i) => (
            <Reveal key={item.number} index={i} className="border border-line p-[22px]">
              <div className="mb-[10px] font-mono text-[11px] text-red">{item.number}</div>
              <h3 className="m-0 mb-2 font-inter text-[18px] font-semibold leading-[1.25] tracking-[-.01em] text-ink md:text-[20px]">
                {t(item.heading, locale)}
              </h3>
              <p className="m-0 font-inter text-[14px] font-light leading-[1.6] text-muted md:text-[15px]">
                {t(item.body, locale)}
              </p>
            </Reveal>
          ))}
        </div>
      </section>

      <ContactSection locale={locale} heading={c.contactHeading} />
    </>
  );
}
