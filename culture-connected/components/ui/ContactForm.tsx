'use client';

import { type CSSProperties, type FormEvent, useState } from 'react';
import { contactShared } from '@/core/content/contact';
import type { Locale } from '@/core/i18n/config';
import { t } from '@/core/i18n/localized';

const fieldClass =
  'rounded-xl border-none bg-white/[.22] p-[15px] font-sora text-[16px] font-light leading-[1.2] text-white md:text-[14px]';

/**
 * Client-side mirror of the prototype's contact form: three required fields,
 * an outline on empty fields after a failed submit, a status note. No
 * backend is wired here either (see README "Assets needed from the client" /
 * form notes) - this needs a real endpoint, spam protection and accessible
 * error messaging before launch.
 */
export function ContactForm({ locale }: { locale: Locale }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'error' | 'sent'>('idle');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (![name, email, message].every((value) => value.trim())) {
      setStatus('error');
      return;
    }
    setStatus('sent');
    setName('');
    setEmail('');
    setMessage('');
  }

  const invalidOutline = (value: string): CSSProperties | undefined =>
    status === 'error' && !value.trim() ? { outline: '1.5px solid currentColor' } : undefined;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-[10px]">
      <input
        type="text"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder={t(contactShared.namePlaceholder, locale)}
        style={invalidOutline(name)}
        className={fieldClass}
      />
      <input
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder={t(contactShared.emailPlaceholder, locale)}
        style={invalidOutline(email)}
        className={fieldClass}
      />
      <textarea
        rows={4}
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        placeholder={t(contactShared.messagePlaceholder, locale)}
        style={invalidOutline(message)}
        className={`resize-y ${fieldClass}`}
      />
      <button
        type="submit"
        className="cursor-pointer rounded-xl border-none bg-white p-4 font-sora text-[14px] font-semibold text-red transition-transform duration-150 active:scale-[0.97]"
      >
        {t(contactShared.sendButton, locale)}
      </button>
      <span
        className="font-mono text-[12px] text-white transition-opacity duration-300"
        style={{ opacity: status === 'idle' ? 0 : 1 }}
      >
        {status === 'error'
          ? contactShared.fillAllFieldsMessage
          : status === 'sent'
            ? contactShared.sentMessage
            : ' '}
      </span>
    </form>
  );
}
