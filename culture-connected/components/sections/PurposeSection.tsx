import { purposeContent } from '@/core/content/purpose';
import { localeHref } from '@/core/i18n/paths';
import { t } from '@/core/i18n/localized';
import type { Locale } from '@/core/i18n/config';
import { Reveal } from '../ui/Reveal';
import { Button } from '../ui/Button';
import { Eyebrow } from '../ui/Eyebrow';
import { BrandMark } from '../ui/BrandMark';

export function PurposeSection({ locale }: { locale: Locale }) {
  const c = purposeContent;

  return (
    <section className="mx-auto max-w-[1440px] px-[clamp(18px,4vw,52px)] pt-[clamp(52px,7vw,84px)]">
      <Reveal className="mb-[clamp(18px,3vw,28px)] flex items-center gap-2 font-mono text-[11px] uppercase tracking-[.16em] text-red">
        <BrandMark className="h-3 w-3 flex-none" />
        <Eyebrow>{t(c.eyebrow, locale)}</Eyebrow>
      </Reveal>

      <Reveal
        as="h2"
        className="m-0 font-display text-[clamp(48px,9vw,140px)] font-bold leading-[.94] tracking-[-.05em] text-ink"
      >
        {t(c.headingLines[0], locale)}
        <br />
        <span className="text-red">{t(c.headingLines[1], locale)}</span>
      </Reveal>

      <div className="mt-[clamp(28px,4vw,44px)] grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] items-end gap-6">
        <Reveal as="p" className="m-0 max-w-[560px] font-sora text-[17px] font-light leading-[1.6] text-muted">
          {t(c.paragraph, locale)}
        </Reveal>
        <Reveal className="flex md:justify-end">
          <Button href={`${localeHref(locale, '/about')}`} variant="dark" className="px-6 py-4 text-[14px]">
            {t(c.cta, locale)} →
          </Button>
        </Reveal>
      </div>
    </section>
  );
}
