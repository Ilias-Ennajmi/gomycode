import { StatCounter } from './StatCounter';

export interface StatRowItem {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  label: string;
  sublabel?: string;
  href?: string;
}

/**
 * Flat stat grid: big bold numbers, thin dividers, no card background, no
 * rotation. Grid with `auto-fit` on desktop so extra stats wrap to a new row
 * instead of overflowing a narrow column (e.g. a two-column case-study
 * layout with 4 stats). Replaces StatTicket and the ad hoc proof-section
 * markup that used to be repeated per page.
 */
export function StatRow({ stats, emphasizeFirst = false }: { stats: StatRowItem[]; emphasizeFirst?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-[repeat(auto-fit,minmax(130px,1fr))] md:gap-x-10 md:gap-y-8">
      {stats.map((stat, i) => {
        const inner = (
          <div className="border-t border-line pt-4 md:pt-0">
            <StatCounter
              value={stat.value}
              decimals={stat.decimals}
              prefix={stat.prefix}
              suffix={stat.suffix}
              className={`font-display text-[clamp(28px,3.6vw,46px)] font-extrabold leading-[.9] tracking-[-.02em] ${
                emphasizeFirst && i === 0 ? 'text-red' : 'text-ink'
              }`}
            />
            <div className="mt-3 font-inter text-[14px] font-medium leading-[1.3] text-ink">{stat.label}</div>
            {stat.sublabel ? <div className="mt-1 font-mono text-[11px] text-muted">{stat.sublabel}</div> : null}
          </div>
        );
        return stat.href ? (
          <a
            key={stat.label + i}
            href={stat.href}
            className="block no-underline transition-opacity duration-150 active:opacity-60"
          >
            {inner}
          </a>
        ) : (
          <div key={stat.label + i}>{inner}</div>
        );
      })}
    </div>
  );
}
