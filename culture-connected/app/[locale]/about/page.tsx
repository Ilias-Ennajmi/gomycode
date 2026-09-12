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
import { NumberedRow } from '@/components/ui/NumberedRow';
import { HoverHeading } from '@/components/ui/HoverHeading';
import { MobileCarousel } from '@/components/ui/MobileCarousel';
import { ContactSection } from '@/components/layout/ContactSection';
import type { Localized } from '@/core/i18n/localized';

interface TeamMember {
  name: string;
  role: Localized;
  bio: Localized;
}

/** Every member gets an equal-sized box — no "featured" larger first card. Name reads in red. */
function TeamCard({ member, locale, portraitLabel, className = '' }: { member: TeamMember; locale: Locale; portraitLabel: string; className?: string }) {
  return (
    <div
      className={`cursor-default border border-line bg-surface transition-all duration-200 hover:-translate-y-[2px] hover:border-ink hover:bg-chip ${className}`}
    >
      <PlaceholderPanel label={portraitLabel} className="h-[clamp(180px,20vw,240px)] p-[14px]" labelClassName="px-[10px] py-[7px] text-[10px]" />
      <div className="p-[22px]">
        <div className="font-inter text-[18px] font-bold leading-[1.2] text-red">{member.name}</div>
        <div className="mt-[6px] font-mono text-[11px] uppercase tracking-[.06em] text-muted">{t(member.role, locale)}</div>
        <p className="m-0 mt-3 font-inter text-[14px] font-light leading-[1.55] text-muted">{t(member.bio, locale)}</p>
      </div>
    </div>
  );
}

export function generateMetadata({ params }: { params: { locale: Locale } }): Metadata {
  const { locale } = params;
  return { title: `culture connected — ${t(navItems[5].label, locale)}` };
}

export default function AboutPage({ params }: { params: { locale: Locale } }) {
  const { locale } = params;
  const c = aboutContent;

  return (
    <>
      <section className="mx-auto max-w-[1440px] px-[clamp(18px,4vw,52px)] pb-[clamp(24px,3vw,44px)] pt-[clamp(56px,7.6vw,100px)]">
        <Reveal className="mb-[clamp(18px,3vw,30px)] font-mono text-[11px] uppercase tracking-[.16em] text-red">
          <Eyebrow>{t(c.eyebrow, locale)}</Eyebrow>
        </Reveal>
        <Reveal>
          <AccentHeading
            heading={c.heading}
            locale={locale}
            className="max-w-[1000px] text-[clamp(42px,7.2vw,100px)] font-extrabold leading-[.94] tracking-[-.03em] text-ink"
          />
        </Reveal>
        <Reveal className="mt-[clamp(20px,3vw,34px)] max-w-[720px] border border-line bg-surface p-[clamp(22px,3vw,32px)]">
          <p className="m-0 font-inter text-[clamp(19px,2.4vw,25px)] font-medium leading-[1.4] text-ink">
            {t(c.missionQuote, locale)}
          </p>
        </Reveal>
      </section>

      <section id="team" className="mx-auto max-w-[1440px] px-[clamp(18px,4vw,52px)] pt-[clamp(48px,6.4vw,72px)]">
        <div className="mb-3 font-mono text-[11px] tracking-[.1em] text-red">CO-FOUNDERS</div>
        <div className="hidden md:grid md:grid-cols-3 md:gap-4">
          {c.founders.map((member, i) => (
            <Reveal key={member.name} index={i}>
              <TeamCard member={member} locale={locale} portraitLabel={t(c.portraitLabel, locale)} />
            </Reveal>
          ))}
        </div>
        <MobileCarousel count={c.founders.length}>
          {c.founders.map((member, i) => (
            <Reveal key={member.name} index={i} className="w-[80vw] max-w-[300px] flex-none snap-start">
              <TeamCard member={member} locale={locale} portraitLabel={t(c.portraitLabel, locale)} />
            </Reveal>
          ))}
        </MobileCarousel>

        <div className="mb-3 mt-[clamp(36px,5vw,52px)] font-mono text-[11px] tracking-[.1em] text-muted">TEAM</div>
        <div className="hidden md:grid md:grid-cols-[repeat(auto-fit,minmax(220px,1fr))] md:gap-4">
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

      <section className="mx-auto max-w-[1440px] px-[clamp(18px,4vw,52px)] pt-[clamp(60px,8vw,96px)]">
        <HoverHeading className="mb-[clamp(22px,3vw,32px)] font-display text-[clamp(28px,3.8vw,40px)] font-extrabold leading-[1.02] tracking-[-.025em] text-ink">
          {t(c.howWeWorkHeading, locale)}
        </HoverHeading>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-x-8 gap-y-2">
          {c.howWeWork.map((item, i) => (
            <Reveal key={item.heading.en} index={i}>
              <NumberedRow number={`0${i + 1}`} heading={t(item.heading, locale)} body={t(item.body, locale)} />
            </Reveal>
          ))}
        </div>
      </section>

      <section id="process" className="mx-auto max-w-[1440px] px-[clamp(18px,4vw,52px)] pt-[clamp(60px,8vw,96px)]">
        <HoverHeading className="mb-[clamp(22px,3vw,34px)] font-display text-[clamp(28px,3.8vw,44px)] font-extrabold leading-[1.02] tracking-[-.03em] text-ink">
          {t(c.processHeading, locale)}
        </HoverHeading>
        <ProcessSteps steps={c.processSteps} locale={locale} firstAccent gridClassName="grid-cols-[repeat(auto-fit,minmax(250px,1fr))]" />
      </section>

      <section id="faq" className="mx-auto max-w-[1000px] px-[clamp(18px,4vw,52px)] pt-[clamp(60px,8vw,96px)]">
        <HoverHeading className="mb-[clamp(18px,3vw,28px)] font-display text-[clamp(28px,3.8vw,44px)] font-extrabold leading-[1.02] tracking-[-.03em] text-ink">
          {t(c.faqHeading, locale)}
        </HoverHeading>
        <Reveal>
          <FaqAccordion
            items={c.faqItems.map((item) => ({
              question: t(item.question, locale),
              answer: t(item.answer, locale),
            }))}
          />
        </Reveal>
      </section>

      <section className="mx-auto max-w-[1000px] px-[clamp(18px,4vw,52px)] pt-[clamp(60px,8vw,96px)]">
        <Reveal className="bg-inv p-[clamp(32px,5vw,56px)] text-center text-onInv">
          <div className="mx-auto mb-4 h-[2px] w-[46px] bg-red" />
          {c.closingStatement.map((line, i) => {
            const sizes = ['text-[clamp(26px,4vw,40px)]', 'text-[clamp(19px,2.6vw,26px)]', 'text-[clamp(16px,2.2vw,20px)]'];
            const opacities = ['', 'opacity-85', 'opacity-65'];
            return (
              <p
                key={i}
                className={`m-0 mx-auto max-w-[640px] font-inter font-bold leading-[1.35] tracking-[-.02em] ${
                  sizes[i] ?? sizes[sizes.length - 1]
                } ${opacities[i] ?? opacities[opacities.length - 1]} ${i > 0 ? 'mt-3' : ''}`}
              >
                {t(line, locale)}
              </p>
            );
          })}
        </Reveal>
      </section>

      <ContactSection locale={locale} heading={c.contactHeading} />
    </>
  );
}
