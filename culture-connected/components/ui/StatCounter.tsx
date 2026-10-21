'use client';

import { useCounter } from '@/hooks/useCounter';

interface StatCounterProps {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}

export function StatCounter({ value, decimals, prefix, suffix, className = '' }: StatCounterProps) {
  const { ref, display } = useCounter<HTMLDivElement>({ value, decimals, prefix, suffix });
  return (
    <div ref={ref} className={className}>
      {display}
    </div>
  );
}
