import type { Locale } from '@/core/i18n/config';
import type { Localized } from '@/core/i18n/localized';
import { t } from '@/core/i18n/localized';
import { Reveal } from './Reveal';

export interface ProcessStepData {
  step: string;
  title: Localized;
  body?: Localized;
}

interface ProcessStepsProps {
  steps: ProcessStepData[];
  locale: Locale;
  /** Give the first column a red top rule instead of the muted line (Home preview only). */
  firstAccent?: boolean;
  gridClassName: string;
}

export function ProcessSteps({ steps, locale, firstAccent = false, gridClassName }: ProcessStepsProps) {
  return (
    <div className={`grid gap-4 ${gridClassName}`}>
      {steps.map((step, i) => (
        <Reveal
          key={step.step}
          index={i}
          className={`border-t-2 pt-4 ${firstAccent && i === 0 ? 'border-red' : 'border-line'}`}
        >
          <div className="mb-2 font-mono text-[11px] text-muted">{step.step}</div>
          <div
            className={`font-sora font-semibold tracking-[-.02em] text-ink ${
              step.body ? 'text-[20px] leading-[1.2]' : 'text-[18px] leading-[1.2]'
            }`}
          >
            {t(step.title, locale)}
          </div>
          {step.body ? (
            <p className="m-0 mt-[10px] font-sora text-[15px] font-light leading-[1.6] text-muted">
              {t(step.body, locale)}
            </p>
          ) : null}
        </Reveal>
      ))}
    </div>
  );
}
