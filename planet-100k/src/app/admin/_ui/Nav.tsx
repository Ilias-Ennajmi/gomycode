'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/admin', label: 'Magasins' },
  { href: '/admin/participants', label: 'Participants' },
  { href: '/admin/reglages', label: 'Réglages' },
];

export default function Nav() {
  const path = usePathname();
  return (
    <nav className="bo-nav" aria-label="Back-office">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} aria-current={path === l.href ? 'page' : undefined}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
