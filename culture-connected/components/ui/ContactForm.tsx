'use client';

import { type CSSProperties, type FormEvent, useState } from 'react';
import { contactShared, footerContent } from '@/core/content/contact';
import type { Locale } from '@/core/i18n/config';
import { t } from '@/core/i18n/localized';

const fieldClass =
  'border-none bg-white/[.14] p-[15px] font-inter text-[16px] font-light leading-[1.2] text-onInv md:text-[14px]';
/** Own left/right/top/bottom padding (not `p-[15px]`) so it never competes with `fieldClass` on the same element for the `padding` shorthand. */
const selectFieldClass =
  'w-full cursor-pointer appearance-none border-none bg-white/[.14] py-[15px] pl-[15px] pr-[38px] font-inter text-[16px] font-light leading-[1.2] text-onInv md:text-[14px]';

/**
 * Client-side contact form: three required fields, an outline on empty
 * fields after a failed submit, a status note. There's no backend on this
 * static export, so submitting opens the visitor's own email app with a
 * pre-filled draft addressed to the real team inbox, rather than silently
 * pretending to send something that never left the browser.
 */
export function ContactForm({ locale }: { locale: Locale }) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'error' | 'sent'>('idle');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (![name, email, message].every((value) => value.trim())) {
      setStatus('error');
      return;
    }
    const roleLabel = contactShared.roleOptions.find((option) => option.value === role)?.label;
    const subject = `New enquiry from ${name}`;
    const body = [roleLabel ? `I am: ${t(roleLabel, locale)}` : null, `Email: ${email}`, '', message]
      .filter((line): line is string => line !== null)
      .join('\n');
    window.location.href = `mailto:${footerContent.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setStatus('sent');
    setName('');
    setRole('');
    setEmail('');
    setMessage('');
  }

  const invalidOutline = (value: string): CSSProperties | undefined =>
    status === 'error' && !value.trim() ? { outline: '1.5px solid currentColor' } : undefined;

  const errorId = 'contact-form-status';

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-[10px]">
      <label htmlFor="contact-name" className="sr-only">
        {t(contactShared.namePlaceholder, locale)}
      </label>
      <input
        id="contact-name"
        type="text"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder={t(contactShared.namePlaceholder, locale)}
        style={invalidOutline(name)}
        aria-invalid={status === 'error' && !name.trim() ? true : undefined}
        aria-describedby={status === 'error' ? errorId : undefined}
        className={fieldClass}
      />
      <label htmlFor="contact-role" className="sr-only">
        {t(contactShared.roleLabel, locale)}
      </label>
      <div className="relative">
        <select
          id="contact-role"
          value={role}
          onChange={(event) => setRole(event.target.value)}
          className={selectFieldClass}
        >
          <option value="" className="text-ink">
            {t(contactShared.roleLabel, locale)}
          </option>
          {contactShared.roleOptions.map((option) => (
            <option key={option.value} value={option.value} className="text-ink">
              {t(option.label, locale)}
            </option>
          ))}
        </select>
        <svg
          aria-hidden="true"
          width="10"
          height="6"
          viewBox="0 0 10 6"
          fill="none"
          className="pointer-events-none absolute right-[15px] top-1/2 -translate-y-1/2 text-onInv"
        >
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <label htmlFor="contact-email" className="sr-only">
        {t(contactShared.emailPlaceholder, locale)}
      </label>
      <input
        id="contact-email"
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder={t(contactShared.emailPlaceholder, locale)}
        style={invalidOutline(email)}
        aria-invalid={status === 'error' && !email.trim() ? true : undefined}
        aria-describedby={status === 'error' ? errorId : undefined}
        className={fieldClass}
      />
      <label htmlFor="contact-message" className="sr-only">
        {t(contactShared.messagePlaceholder, locale)}
      </label>
      <textarea
        id="contact-message"
        rows={4}
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        placeholder={t(contactShared.messagePlaceholder, locale)}
        style={invalidOutline(message)}
        aria-invalid={status === 'error' && !message.trim() ? true : undefined}
        aria-describedby={status === 'error' ? errorId : undefined}
        className={`resize-y ${fieldClass}`}
      />
      <button
        type="submit"
        className="cursor-pointer border-none bg-white p-4 font-inter text-[14px] font-semibold text-red transition-transform duration-150 active:scale-[0.97]"
      >
        {t(contactShared.sendButton, locale)}
      </button>
      <span
        id={errorId}
        role="alert"
        className="font-mono text-[12px] text-onInv transition-opacity duration-300"
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
