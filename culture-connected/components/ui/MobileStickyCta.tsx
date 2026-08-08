'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { t } from '@/core/i18n/localized';
import { contactNavLabel } from '@/core/content/nav';
import type { Locale } from '@/core/i18n/config';

/**
 * Persistent bottom CTA, mobile-only. Appears once the visitor has scrolled
 * past the hero, hides again once the real contact section comes into view
 * so it never sits on top of the form it's pointing at.
 */
export function MobileStickyCta({ locale }: { locale: Locale }) {
  const [pastHero, setPastHero] = useState(false);
  const [nearContact, setNearContact] = useState(false);
  const [nearBottom, setNearBottom] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setPastHero(window.scrollY > window.innerHeight * 0.6);
      setNearBottom(window.scrollY + window.innerHeight > document.body.scrollHeight - 400);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);

    const contact = document.getElementById('contact');
    let observer: IntersectionObserver | undefined;
    if (contact) {
      observer = new IntersectionObserver(([entry]) => setNearContact(entry.isIntersecting), {
        rootMargin: '0px 0px -15% 0px',
      });
      observer.observe(contact);
    }

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      observer?.disconnect();
    };
  }, []);

  const visible = pastHero && !nearContact && !nearBottom;

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-30 px-4 pb-4 transition-all duration-300 md:hidden ${
        visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0'
      }`}
    >
      <Link
        href="#contact"
        className="block rounded-full bg-red py-[15px] text-center font-sora text-[14px] font-semibold text-white no-underline shadow-[0_8px_24px_rgba(0,0,0,.18)] transition-transform active:scale-[0.97]"
      >
        {t(contactNavLabel, locale)} →
      </Link>
    </div>
  );
}
