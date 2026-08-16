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
import { MobileCarousel } from '@/components/ui/MobileCarousel';
import { ContactSection } from '@/components/layout/ContactSection';
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
  featured = false,
  className = '',
}: {
  member: TeamMember;
  locale: Locale;
  portraitLabel: string;
  featured?: boolean;
  className?: string;
}) {
  return (
    <div className={`border border-line bg-surface ${className}`}>
      <PlaceholderPanel
        label={portraitLabel}
        className={`p-[14px] ${featured ? 'h-[clamp(220px,26vw,320px)]' : 'h-[clamp(180px,20vw,240px)]'}`}
        labelClassName="px-[10px] py-[7px] text-[10px]"
      />
      <div className="p-[22px]">
        <div className={`font-inter leading-[1.2] text-ink ${featured ? 'text-[22px] font-bold' : 'text-[18px] font-semibold'}`}>
          {member.name}
        </div>
        <div className="mt-[6px] font-mono text-[11px] text-red">{t(member.role, locale)}</div>
        <p className="m-0 mt-3 font-inter text-[14px] font-light leading-[1.55] text-muted">{t(member.bio, locale)}</p>
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

      <section className="mx-auto max-w-[1440px] px-[clamp(18px,4vw,52px)] pt-[clamp(48px,6.4vw,72px)]">
        <Reveal as="h2" className="mb-[clamp(22px,3vw,32px)] font-display text-[clamp(28px,3.8vw,40px)] font-extrabold leading-[1.02] tracking-[-.025em] text-ink">
          {t(c.howWeWorkHeading, locale)}
        </Reveal>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-x-8 gap-y-2">
          {c.howWeWork.map((item, i) => (
            <Reveal key={item.heading.en} index={i}>
              <NumberedRow number={`0${i + 1}`} heading={t(item.heading, locale)} body={t(item.body, locale)} />
            </Reveal>
          ))}
        </div>
      </section>

      <section id="team" className="mx-auto max-w-[1440px] px-[clamp(18px,4vw,52px)] pt-[clamp(60px,8vw,96px)]">
        <div className="hidden md:grid md:grid-cols-[repeat(auto-fit,minmax(300px,1fr))] md:gap-4">
          {c.team.map((member, i) => (
            <Reveal key={member.name + member.role.en} index={i} className={i === 0 ? 'md:col-span-2' : ''}>
              <TeamCard
                member={member}
                locale={locale}
                portraitLabel={t(c.portraitLabel, locale)}
                featured={i === 0}
              />
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

      <section id="process" className="mx-auto max-w-[1440px] px-[clamp(18px,4vw,52px)] pt-[clamp(60px,8vw,96px)]">
        <Reveal as="h2" className="mb-[clamp(22px,3vw,34px)] font-display text-[clamp(28px,3.8vw,44px)] font-extrabold leading-[1.02] tracking-[-.03em] text-ink">
          {t(c.processHeading, locale)}
        </Reveal>
        <ProcessSteps steps={c.processSteps} locale={locale} gridClassName="grid-cols-[repeat(auto-fit,minmax(250px,1fr))]" />
      </section>

      <section id="faq" className="mx-auto max-w-[1000px] px-[clamp(18px,4vw,52px)] pt-[clamp(60px,8vw,96px)]">
        <Reveal as="h2" className="mb-[clamp(18px,3vw,28px)] font-display text-[clamp(28px,3.8vw,44px)] font-extrabold leading-[1.02] tracking-[-.03em] text-ink">
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

      <section className="mx-auto max-w-[1000px] px-[clamp(18px,4vw,52px)] pt-[clamp(60px,8vw,96px)]">
        <Reveal className="bg-inv p-[clamp(28px,4vw,44px)] text-onInv">
          {c.closingStatement.map((line, i) => {
            const sizes = ['text-[clamp(24px,3.6vw,36px)]', 'text-[clamp(20px,3vw,30px)]', 'text-[clamp(17px,2.4vw,24px)]'];
            const opacities = ['', 'opacity-90', 'opacity-75'];
            return (
              <p
                key={i}
                className={`m-0 font-inter font-bold leading-[1.35] tracking-[-.02em] ${sizes[i] ?? sizes[sizes.length - 1]} ${
                  opacities[i] ?? opacities[opacities.length - 1]
                }`}
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
