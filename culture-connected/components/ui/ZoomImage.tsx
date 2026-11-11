'use client';

import { useState } from 'react';

interface ZoomImageProps {
  src: string;
  alt: string;
  shown: boolean;
  className?: string;
}

/**
 * Entrance zoom-settle keyed off the parent `Reveal`'s `shown` state, so it
 * plays on scroll-into-view without needing hover — works on touch, not
 * just desktop. A hover-zoom stacks on top for pointer devices. Both live
 * in one inline `transform` so they can't fight over the CSS cascade (two
 * Tailwind transform utilities on the same element hit a real
 * cascade-order bug earlier this session).
 */
export function ZoomImage({ src, alt, shown, className = '' }: ZoomImageProps) {
  const [hovered, setHovered] = useState(false);
  const scale = !shown ? 1.12 : hovered ? 1.06 : 1;

  return (
    <div
      className={`overflow-hidden ${className}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className="h-full w-full object-cover"
        style={{ transform: `scale(${scale})`, transition: 'transform 700ms cubic-bezier(0.2,0.7,0.2,1)' }}
      />
    </div>
  );
}
