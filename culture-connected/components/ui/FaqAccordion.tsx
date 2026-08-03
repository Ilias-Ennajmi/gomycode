'use client';

import { useRef, useState } from 'react';

interface FaqItemData {
  question: string;
  answer: string;
}

function FaqItem({ question, answer }: FaqItemData) {
  const [open, setOpen] = useState(false);
  const answerRef = useRef<HTMLParagraphElement>(null);

  return (
    <div className="border-t border-line last:border-b">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center justify-between gap-5 py-[22px] text-left font-sora text-[18px] font-semibold leading-[1.3] text-ink"
      >
        {question}
        <span
          aria-hidden="true"
          className="shrink-0 font-sora text-[22px] leading-none text-red transition-transform duration-[250ms] ease-out"
          style={{ transform: open ? 'rotate(45deg)' : 'none' }}
        >
          +
        </span>
      </button>
      <div
        className="overflow-hidden transition-[max-height,opacity] duration-[350ms] ease-out"
        style={{
          maxHeight: open ? `${(answerRef.current?.scrollHeight ?? 400) + 40}px` : '0px',
          opacity: open ? 1 : 0,
        }}
      >
        <p ref={answerRef} className="m-0 mb-[22px] font-sora text-[16px] font-light leading-[1.65] text-muted">
          {answer}
        </p>
      </div>
    </div>
  );
}

export function FaqAccordion({ items }: { items: FaqItemData[] }) {
  return (
    <div className="flex flex-col">
      {items.map((item) => (
        <FaqItem key={item.question} {...item} />
      ))}
    </div>
  );
}
