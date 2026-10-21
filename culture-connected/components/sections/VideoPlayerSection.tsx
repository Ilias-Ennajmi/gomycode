'use client';

import { useState } from 'react';
import { CarouselArrows } from '../ui/CarouselArrows';
import { PlaceholderPanel } from '../ui/PlaceholderPanel';

const SLOT_COUNT = 4;

interface VideoPlayerSectionProps {
  prevLabel: string;
  nextLabel: string;
  placeholderLabel: string;
  className?: string;
}

/**
 * Single-video-at-a-time player with arrows on each side to switch videos.
 * No video files exist yet, so each slot is a labelled placeholder —
 * architecturally ready to swap in real `<video>` sources once the client
 * supplies them (same discipline as PlaceholderPanel elsewhere).
 */
export function VideoPlayerSection({ prevLabel, nextLabel, placeholderLabel, className = '' }: VideoPlayerSectionProps) {
  const [index, setIndex] = useState(0);

  return (
    <div className={className}>
      <PlaceholderPanel
        label={`${placeholderLabel} (${index + 1}/${SLOT_COUNT})`}
        className="aspect-video w-full p-4"
        labelClassName="px-3 py-2 text-[11px]"
      />
      <CarouselArrows
        canPrev={index > 0}
        canNext={index < SLOT_COUNT - 1}
        onPrev={() => setIndex((i) => Math.max(0, i - 1))}
        onNext={() => setIndex((i) => Math.min(SLOT_COUNT - 1, i + 1))}
        prevLabel={prevLabel}
        nextLabel={nextLabel}
        className="mt-4 justify-center"
      />
    </div>
  );
}
