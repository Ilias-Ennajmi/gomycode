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
          className={`group cursor-default border-t-2 pt-4 transition-colors duration-200 hover:border-red ${
            firstAccent && i === 0 ? 'border-red' : 'border-line'
          }`}
        >
          <div className="mb-2 font-mono text-[11px] text-muted">{step.step}</div>
          <div
            className={`font-inter font-semibold tracking-[-.02em] text-ink transition-colors duration-200 group-hover:text-red ${
              step.body ? 'text-[20px] leading-[1.2]' : 'text-[18px] leading-[1.2]'
            }`}
          >
            {t(step.title, locale)}
          </div>
          {step.body ? (
            <p className="m-0 mt-[10px] font-inter text-[15px] font-light leading-[1.6] text-muted">
              {t(step.body, locale)}
            </p>
          ) : null}
        </Reveal>
      ))}
    </div>
  );
}
