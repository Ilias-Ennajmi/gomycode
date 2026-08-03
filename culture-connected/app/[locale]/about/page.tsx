import type { Metadata } from 'next';
import type { Locale } from '@/core/i18n/config';
import { t } from '@/core/i18n/localized';
import { aboutContent } from '@/core/content/about';
import { navItems } from '@/core/content/nav';
import { AccentHeading } from '@/components/ui/AccentHeading';
import { PlaceholderPanel } from '@/components/ui/PlaceholderPanel';
import { Reveal } from '@/components/ui/Reveal';
import { ProcessSteps } from '@/components/ui/ProcessSteps';
import { FaqAccordion } from '@/components/ui/FaqAccordion';
import { ContactSection } from '@/components/layout/ContactSection';

export function generateMetadata({ params }: { params: { locale: Locale } }): Metadata {
  const { locale } = params;
  return { title: `culture connected — ${t(navItems[3].label, locale)}` };
}

export default function AboutPage({ params }: { params: { locale: Locale } }) {
  const { locale } = params;
  const c = aboutContent;

  return (
    <>
      <section className="mx-auto max-w-[1440px] px-[clamp(18px,4vw,52px)] pb-[clamp(24px,3vw,44px)] pt-[clamp(48px,7vw,92px)]">
        <Reveal className="mb-[clamp(18px,3vw,30px)] font-mono text-[11px] uppercase tracking-[.16em] text-red">
          {t(c.eyebrow, locale)}
        </Reveal>
        <Reveal>
          <AccentHeading
            heading={c.heading}
            locale={locale}
            className="max-w-[1000px] font-sora text-[clamp(40px,7vw,96px)] font-bold leading-[.95] tracking-[-.05em] text-ink"
          />
        </Reveal>
        <Reveal as="p" className="m-0 mt-[clamp(20px,3vw,34px)] max-w-[600px] font-sora text-[17px] font-light leading-[1.6] text-muted">
          {t(c.intro, locale)}
        </Reveal>
      </section>

      <section id="team" className="mx-auto max-w-[1440px] px-[clamp(18px,4vw,52px)]">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-4">
          {c.team.map((member, i) => (
            <Reveal key={member.name + member.role.en} index={i} className="overflow-hidden rounded-3xl bg-surface">
              <PlaceholderPanel
                label={t(c.portraitLabel, locale)}
                className="h-[clamp(180px,20vw,240px)] p-[14px]"
                labelClassName="px-[10px] py-[7px] text-[10px]"
              />
              <div className="p-[22px]">
                <div className="font-sora text-[18px] font-semibold leading-[1.2] text-ink">{member.name}</div>
                <div className="mt-[6px] font-mono text-[11px] text-red">{t(member.role, locale)}</div>
                <p className="m-0 mt-3 font-sora text-[14px] font-light leading-[1.55] text-muted">{t(member.bio, locale)}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal as="p" className="m-0 mt-4 font-mono text-[11px] font-normal leading-[1.6] text-muted">
          {t(c.teamNote, locale)}
        </Reveal>
      </section>

      <section id="process" className="mx-auto max-w-[1440px] px-[clamp(18px,4vw,52px)] pt-[clamp(52px,7vw,84px)]">
        <Reveal as="h2" className="mb-[clamp(22px,3vw,34px)] font-sora text-[clamp(28px,3.8vw,44px)] font-bold leading-[1.05] tracking-[-.035em] text-ink">
          {t(c.processHeading, locale)}
        </Reveal>
        <ProcessSteps steps={c.processSteps} locale={locale} gridClassName="grid-cols-[repeat(auto-fit,minmax(250px,1fr))]" />
      </section>

      <section id="faq" className="mx-auto max-w-[1000px] px-[clamp(18px,4vw,52px)] pt-[clamp(52px,7vw,84px)]">
        <Reveal as="h2" className="mb-[clamp(18px,3vw,28px)] font-sora text-[clamp(28px,3.8vw,44px)] font-bold leading-[1.05] tracking-[-.035em] text-ink">
          {t(c.faqHeading, locale)}
        </Reveal>
        <Reveal>
          <FaqAccordion
            items={c.faqItems.map((item) => ({
              question: t(item.question, locale),
              answer: t(item.answer, locale),
            }))}
          />
        </Reveal>
      </section>

      <ContactSection locale={locale} heading={c.contactHeading} />
    </>
  );
}
