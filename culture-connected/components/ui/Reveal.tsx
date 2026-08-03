'use client';

import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';
import { useReveal } from '@/hooks/useReveal';

type RevealOwnProps<T extends ElementType> = {
  index?: number;
  as?: T;
  className?: string;
  children: ReactNode;
};

type RevealProps<T extends ElementType> = RevealOwnProps<T> &
  Omit<ComponentPropsWithoutRef<T>, keyof RevealOwnProps<T>>;

/** Wraps the `[data-rv]` scroll-reveal behaviour as a polymorphic component. */
export function Reveal<T extends ElementType = 'div'>({
  index = 0,
  as,
  className = '',
  children,
  ...rest
}: RevealProps<T>) {
  const Tag = (as ?? 'div') as ElementType;
  const { ref, shown } = useReveal<HTMLElement>(index);

  return (
    <Tag
      ref={ref}
      className={`transition-all duration-[750ms] ease-[cubic-bezier(0.2,0.7,0.2,1)] ${
        shown ? 'translate-y-0 opacity-100' : 'translate-y-[22px] opacity-0'
      } ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  );
}
