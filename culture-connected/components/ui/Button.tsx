'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useRef, useState, type MouseEvent } from 'react';

type Variant = 'solid' | 'outline' | 'dark' | 'light';

const variantClasses: Record<Variant, string> = {
  solid: 'bg-red text-white',
  outline: 'border border-line text-ink',
  dark: 'bg-inv text-onInv',
  light: 'bg-white text-red',
};

interface ButtonProps {
  href: string;
  children: ReactNode;
  variant?: Variant;
  className?: string;
}

/**
 * Subtle magnetic hover: the button nudges toward the cursor within its own
 * bounds. Tracked in React state/refs rather than CSS so the offset can be
 * computed from real cursor position; resets via a CSS transition on
 * mouseleave so `active:scale` (click feedback) still works at rest.
 */
export function Button({ href, children, variant = 'solid', className = '' }: ButtonProps) {
  const ref = useRef<HTMLAnchorElement>(null);
  const [offset, setOffset] = useState<{ x: number; y: number } | null>(null);

  function handleMouseMove(event: MouseEvent<HTMLAnchorElement>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (event.clientX - rect.left - rect.width / 2) * 0.25;
    const y = (event.clientY - rect.top - rect.height / 2) * 0.25;
    setOffset({ x, y });
  }

  return (
    <Link
      ref={ref}
      href={href}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setOffset(null)}
      style={{
        transform: offset ? `translate(${offset.x}px, ${offset.y}px)` : undefined,
        transition: offset ? 'none' : 'transform 300ms cubic-bezier(0.2,0.7,0.2,1)',
      }}
      className={`inline-flex items-center justify-center whitespace-nowrap font-inter font-semibold no-underline active:scale-[0.97] ${variantClasses[variant]} ${className}`}
    >
      {children}
    </Link>
  );
}
