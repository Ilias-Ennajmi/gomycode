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
import { Eyebrow } from '@/components/ui/Eyebrow';
import { MobileCarousel } from '@/components/ui/MobileCarousel';
import { ContactSection } from '@/components/layout/ContactSection';
import { PillarMarker } from '@/components/sections/PillarMarker';
import type { Localized } from '@/core/i18n/localized';

interface TeamMember {
  name: string;
  role: Localized;
  bio: Localized;
}

function TeamCard({
  member,
  locale,
  portraitLabel,
  className = '',
}: {
  member: TeamMember;
  locale: Locale;
  portraitLabel: string;
  className?: string;
}) {
  return (
    <div className={`overflow-hidden rounded-3xl bg-surface ${className}`}>
      <PlaceholderPanel
        label={portraitLabel}
        className="h-[clamp(180px,20vw,240px)] p-[14px]"
        labelClassName="px-[10px] py-[7px] text-[10px]"
      />
      <div className="p-[22px]">
        <div className="font-sora text-[18px] font-semibold leading-[1.2] text-ink">{member.name}</div>
        <div className="mt-[6px] font-mono text-[11px] text-red">{t(member.role, locale)}</div>
        <p className="m-0 mt-3 font-sora text-[14px] font-light leading-[1.55] text-muted">{t(member.bio, locale)}</p>
      </div>
    </div>
  );
}

export function generateMetadata({ params }: { params: { locale: Locale } }): Metadata {
  const { locale } = params;
  return { title: `culture connected — ${t(navItems[4].label, locale)}` };
}

export default function AboutPage({ params }: { params: { locale: Locale } }) {
  const { locale } = params;
  const c = aboutContent;

  return (
    <>
      <section className="mx-auto max-w-[1440px] px-[clamp(18px,4vw,52px)] pb-[clamp(24px,3vw,44px)] pt-[clamp(48px,7vw,92px)]">
        <Reveal className="mb-[clamp(18px,3vw,30px)] font-mono text-[11px] uppercase tracking-[.16em] text-red">
          <Eyebrow>{t(c.eyebrow, locale)}</Eyebrow>
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
        <Reveal className="mt-[clamp(24px,3vw,36px)] max-w-[720px] rounded-[clamp(18px,2.6vw,26px)] bg-surface p-[clamp(22px,3vw,32px)]">
          <p className="m-0 font-sora text-[clamp(19px,2.4vw,25px)] font-medium leading-[1.4] text-ink">
            {t(c.missionQuote, locale)}
          </p>
        </Reveal>
      </section>

      <section className="mx-auto max-w-[1440px] px-[clamp(18px,4vw,52px)] pt-[clamp(40px,6vw,64px)]">
        <Reveal as="h2" className="mb-[clamp(22px,3vw,32px)] font-sora text-[clamp(28px,3.8vw,40px)] font-bold leading-[1.05] tracking-[-.035em] text-ink">
          {t(c.howWeWorkHeading, locale)}
        </Reveal>
        <div className="flex flex-col gap-4">
          <Reveal index={0} className="rounded-3xl bg-inv p-[clamp(24px,3vw,32px)] text-onInv">
            <PillarMarker marker={c.howWeWork[0].marker} />
            <h3 className="m-0 mb-[10px] font-sora text-[19px] font-semibold leading-[1.2] tracking-[-.02em]">
              {t(c.howWeWork[0].heading, locale)}
            </h3>
            <p className="m-0 max-w-[520px] font-sora text-[14px] font-light leading-[1.55] opacity-70">
              {t(c.howWeWork[0].body, locale)}
            </p>
          </Reveal>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-4">
            {c.howWeWork.slice(1).map((item, i) => (
              <Reveal key={item.heading.en} index={i + 1} className="rounded-3xl bg-surface p-[clamp(24px,3vw,32px)] text-ink">
                <PillarMarker marker={item.marker} />
                <h3 className="m-0 mb-[10px] font-sora text-[19px] font-semibold leading-[1.2] tracking-[-.02em]">
                  {t(item.heading, locale)}
                </h3>
                <p className="m-0 font-sora text-[14px] font-light leading-[1.55] opacity-70">{t(item.body, locale)}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section id="team" className="mx-auto max-w-[1440px] px-[clamp(18px,4vw,52px)] pt-[clamp(52px,7vw,84px)]">
        <div className="hidden md:grid md:grid-cols-[repeat(auto-fit,minmax(300px,1fr))] md:gap-4">
          {c.team.map((member, i) => (
            <Reveal key={member.name + member.role.en} index={i}>
              <TeamCard member={member} locale={locale} portraitLabel={t(c.portraitLabel, locale)} />
            </Reveal>
          ))}
        </div>
        <MobileCarousel count={c.team.length}>
          {c.team.map((member, i) => (
            <Reveal key={member.name + member.role.en} index={i} className="w-[80vw] max-w-[300px] flex-none snap-start">
              <TeamCard member={member} locale={locale} portraitLabel={t(c.portraitLabel, locale)} />
            </Reveal>
          ))}
        </MobileCarousel>
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
