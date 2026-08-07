import type { Metadata } from 'next';
import type { Locale } from '@/core/i18n/config';
import { t } from '@/core/i18n/localized';
import { blogContent } from '@/core/content/blog';
import { blogNavLabel } from '@/core/content/nav';
import { AccentHeading } from '@/components/ui/AccentHeading';
import { PlaceholderPanel } from '@/components/ui/PlaceholderPanel';
import { Reveal } from '@/components/ui/Reveal';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { ContactSection } from '@/components/layout/ContactSection';

export function generateMetadata({ params }: { params: { locale: Locale } }): Metadata {
  const { locale } = params;
  return { title: `culture connected — ${t(blogNavLabel, locale)}` };
}

export default function BlogPage({ params }: { params: { locale: Locale } }) {
  const { locale } = params;
  const c = blogContent;

  return (
    <>
      <section className="mx-auto max-w-[1440px] px-[clamp(18px,4vw,52px)] pb-[clamp(28px,4vw,48px)] pt-[clamp(48px,7vw,92px)]">
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
      </section>

      <section className="mx-auto max-w-[1440px] px-[clamp(18px,4vw,52px)]">
        <Reveal as="h2" className="mb-[clamp(22px,3vw,34px)] font-sora text-[clamp(28px,3.6vw,40px)] font-bold leading-none tracking-[-.035em] text-ink">
          {t(c.postsHeading, locale)}
        </Reveal>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
          {c.posts.map((post, i) => (
            <Reveal key={i} index={i} className="overflow-hidden rounded-3xl bg-surface">
              <PlaceholderPanel
                label={t(c.imageLabel, locale)}
                className="aspect-[4/3] p-[14px]"
                labelClassName="px-[10px] py-[7px] text-[10px]"
              />
              <div className="p-[22px]">
                <div className="font-mono text-[11px] tracking-[.08em] text-red">{t(post.category, locale)}</div>
                <div className="mt-2 font-sora text-[17px] font-semibold leading-[1.25] text-ink">{t(post.titleLabel, locale)}</div>
                <div className="mt-2 font-mono text-[11px] text-muted">{c.dateLabel}</div>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal as="p" className="m-0 mt-4 font-mono text-[11px] font-normal leading-[1.6] text-muted">
          {t(c.noteLabel, locale)}
        </Reveal>
      </section>

      <ContactSection locale={locale} heading={c.contactHeading} />
    </>
  );
}
