import type { Metadata } from 'next';
import type { Locale } from '@/core/i18n/config';
import { localeHref } from '@/core/i18n/paths';
import { t } from '@/core/i18n/localized';
import { creativeContent } from '@/core/content/creative';
import { navItems } from '@/core/content/nav';
import { AccentHeading } from '@/components/ui/AccentHeading';
import { Button } from '@/components/ui/Button';
import { HeroMediaPanel } from '@/components/ui/HeroMediaPanel';
import { Reveal } from '@/components/ui/Reveal';
import { ServiceIcon } from '@/components/ui/ServiceIcon';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { ContactSection } from '@/components/layout/ContactSection';

export function generateMetadata({ params }: { params: { locale: Locale } }): Metadata {
  const { locale } = params;
  return { title: `culture connected — ${t(navItems[2].label, locale)}` };
}

export default function CreativePage({ params }: { params: { locale: Locale } }) {
  const { locale } = params;
  const c = creativeContent;

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
        className="mx-[clamp(18px,4vw,52px)] h-[clamp(140px,34vw,400px)] rounded-[clamp(18px,3vw,28px)]"
      />

      <section className="mx-auto max-w-[1440px] px-[clamp(18px,4vw,52px)] pt-[clamp(52px,7vw,84px)]">
        <Reveal as="h2" className="mb-[clamp(22px,3vw,34px)] font-sora text-[clamp(28px,3.8vw,44px)] font-bold leading-[1.05] tracking-[-.035em] text-ink">
          {t(c.servicesHeading, locale)}
        </Reveal>
        <div className="flex flex-col gap-4">
          <Reveal index={0} className="rounded-3xl bg-inv p-[clamp(24px,3vw,32px)] text-onInv">
            <div className="mb-4 flex items-center gap-3">
              <ServiceIcon name={c.services[0].icon} className="h-6 w-6 text-red" />
              <span className="font-mono text-[11px] text-red">{c.services[0].number}</span>
            </div>
            <h3 className="m-0 mb-[10px] font-sora text-[22px] font-semibold leading-[1.15] tracking-[-.02em]">
              {t(c.services[0].heading, locale)}
            </h3>
            <p className="m-0 max-w-[520px] font-sora text-[15px] font-light leading-[1.6] opacity-70">
              {t(c.services[0].body, locale)}
            </p>
          </Reveal>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(360px,1fr))] gap-4">
            {c.services.slice(1).map((item, i) => (
              <Reveal key={item.number} index={i + 1} className="rounded-3xl bg-surface p-[clamp(24px,3vw,32px)] text-ink">
                <div className="mb-4 flex items-center gap-3">
                  <ServiceIcon name={item.icon} className="h-6 w-6 text-red" />
                  <span className="font-mono text-[11px] text-red">{item.number}</span>
                </div>
                <h3 className="m-0 mb-[10px] font-sora text-[22px] font-semibold leading-[1.15] tracking-[-.02em]">
                  {t(item.heading, locale)}
                </h3>
                <p className="m-0 font-sora text-[15px] font-light leading-[1.6] opacity-70">{t(item.body, locale)}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <ContactSection locale={locale} heading={c.contactHeading} />
    </>
  );
}
