import Link from 'next/link';
import type { ReactNode } from 'react';

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

export function Button({ href, children, variant = 'solid', className = '' }: ButtonProps) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center whitespace-nowrap font-inter font-semibold no-underline transition-transform duration-150 active:scale-[0.97] ${variantClasses[variant]} ${className}`}
    >
      {children}
    </Link>
  );
}
