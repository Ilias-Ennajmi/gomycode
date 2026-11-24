'use client';

import { useEffect, useRef, useState } from 'react';
import type { GameState, Lang, Me, StoreStatus } from '@/core/types';
import { register, resume, spin, type FieldErrors, type RegisterResult } from './actions';
import { closedCopy, DICTS, fill, type Dict } from './i18n';
import * as sound from './sound';

type Sym = '1' | '0' | 'ballon' | 'sneaker' | 'basket' | 'trophee' | 'sifflet';
type Screen = 'lang' | 'intro' | 'form' | 'machine' | 'won' | 'lost' | 'closed';
type Phase = 'idle' | 'loop' | 'land';

const ALL: Sym[] = ['1', '0', 'ballon', 'sneaker', 'basket', 'trophee', 'sifflet'];
const OBJECTS: Sym[] = ['ballon', 'sneaker', 'basket', 'trophee', 'sifflet'];
const JACKPOT: Sym[] = ['1', '0', '0'];
// Chaque rouleau montre son symbole au centre et un bout de ses voisins.
const IDLE: Sym[][] = [
  ['trophee', 'ballon', 'sifflet'],
  ['sifflet', 'sneaker', 'basket'],
  ['ballon', 'trophee', 'sneaker'],
];
const DEVICE_KEY = 'ps100k_device';
const LANG_KEY = 'ps100k_lang';
const MUTE_KEY = 'ps100k_mute';
const LAND_MS = [1400, 1950, 2600];

const pick = (from: Sym[]): Sym => from[Math.floor(Math.random() * from.length)];

function losingLine(): Sym[] {
  for (;;) {
    const line = [pick(ALL), pick(ALL), pick(ALL)];
    if (line.some((s, i) => s !== JACKPOT[i])) return line;
  }
}

function loopStrip(): Sym[] {
  const eight = [...ALL, pick(OBJECTS)].sort(() => Math.random() - 0.5);
  return [...eight, ...eight.slice(0, 3)];
}

function fingerprint(): string {
  try {
    const n = navigator;
    return [
      n.userAgent,
      n.language,
      (n.languages ?? []).join(','),
      n.hardwareConcurrency,
      n.maxTouchPoints,
      screen.width,
      screen.height,
      screen.colorDepth,
      window.devicePixelRatio,
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    ].join('|');
  } catch {
    return '';
  }
}

function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* navigation privée : le cookie suffit */
  }
}

const svg = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

const ICONS = {
  form: (
    <svg {...svg}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
    </svg>
  ),
  play: (
    <svg {...svg}>
      <rect x="2.5" y="7" width="15" height="12" rx="2.5" />
      <path d="M7.5 7v12M12.5 7v12M20 15V7" />
      <circle cx="20" cy="5" r="2" fill="currentColor" />
    </svg>
  ),
  ticket: (
    <svg {...svg}>
      <path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z" />
      <path d="M14 6v2.5M14 11v2M14 15.5V18" />
    </svg>
  ),
  instagram: (
    <svg {...svg}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.3" cy="6.7" r="0.6" fill="currentColor" />
    </svg>
  ),
  tiktok: (
    <svg {...svg}>
      <path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.500" />
      <path d="M14 3c.3 2.600 2 4.300 4.500 4.500" />
    </svg>
  ),
  globe: (
    <svg {...svg}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.500 2.600 3.800 5.600 3.800 9s-1.300 6.400-3.800 9c-2.500-2.600-3.800-5.600-3.800-9S9.500 5.600 12 3z" />
    </svg>
  ),
  whatsapp: (
    <svg {...svg}>
      <path d="M4 20l1.300-4.200A8 8 0 1 1 8.400 19z" />
      <path d="M9.200 9c0 3 2.800 5.800 5.800 5.800l1-1.600-2-1-.9.900c-.900-.400-1.800-1.300-2.200-2.200l.900-.900-1-2z" />
    </svg>
  ),
  soundOn: (
    <svg {...svg}>
      <path d="M4 10v4h3l5 4V6L7 10z" />
      <path d="M16 9a4 4 0 0 1 0 6M18.500 6.500a7.500 7.500 0 0 1 0 11" />
    </svg>
  ),
  soundOff: (
    <svg {...svg}>
      <path d="M4 10v4h3l5 4V6L7 10z" />
      <path d="M16.500 9.500l5 5M21.500 9.500l-5 5" />
    </svg>
  ),
};

function Symbol({ sym }: { sym: Sym }) {
  if (sym === '1' || sym === '0') return <span className="sym">{sym}</span>;
  return (
    <span className="sym">
      <img src={`/reel/${sym}.webp`} alt="" width={360} height={360} draggable={false} />
    </span>
  );
}

function Reel({ phase, strip, landMs }: { phase: Phase; strip: Sym[]; landMs: number }) {
  const [go, setGo] = useState(false);
  useEffect(() => {
    if (phase !== 'land') {
      setGo(false);
      return;
    }
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setGo(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [phase]);

  // Le symbole visé est centré dans la fenêtre : 0,28 cellule au-dessus, autant en dessous.
  const index = phase === 'land' && go ? strip.length - 2 : 1;
  return (
    <div className="reel">
      <div
        className="reel-strip"
        data-phase={phase}
        style={
          phase === 'loop'
            ? undefined
            : ({ transform: `translateY(calc(var(--cell) * ${0.28 - index}))`, '--land': `${landMs}ms` } as React.CSSProperties)
        }
      >
        {strip.map((s, i) => (
          <Symbol key={i} sym={s} />
        ))}
      </div>
    </div>
  );
}

function Machine(props: { phase: Phase; strips: Sym[][]; won: boolean; pulled: boolean; onPull: () => void; label: string }) {
  const { phase, strips, won, pulled, onPull, label } = props;
  return (
    <div className="machine-wrap" dir="ltr">
      <div className="machine" data-won={won} aria-hidden="true">
        <p className="machine-sign">100K</p>
        <div className="machine-window">
          <i className="payline payline-l" />
          <i className="payline payline-r" />
          {strips.map((strip, i) => (
            <Reel key={i} phase={phase} strip={strip} landMs={LAND_MS[i]} />
          ))}
        </div>
        <p className="machine-led">1000 DH</p>
      </div>
      <button
        type="button"
        className="lever"
        data-pulled={pulled}
        onClick={onPull}
        disabled={phase !== 'idle' || pulled}
        aria-label={label}
      >
        <span className="lever-base" />
        <span className="lever-arm" />
      </button>
    </div>
  );
}

type LinkSet = { instagram: string; tiktok: string; website: string };

function Socials({ links, t }: { links: LinkSet; t: Dict }) {
  if (!links.instagram && !links.tiktok && !links.website) return null;
  return (
    <div className="socials">
      <p>{t.follow}</p>
      <div>
        {links.instagram && (
          <a href={links.instagram} target="_blank" rel="noopener noreferrer" aria-label="Instagram">
            {ICONS.instagram}
          </a>
        )}
        {links.tiktok && (
          <a href={links.tiktok} target="_blank" rel="noopener noreferrer" aria-label="TikTok">
            {ICONS.tiktok}
          </a>
        )}
        {links.website && (
          <a href={links.website} target="_blank" rel="noopener noreferrer" aria-label="planetsport.ma">
            {ICONS.globe}
          </a>
        )}
      </div>
    </div>
  );
}

function Offers({ links, t }: { links: LinkSet; t: Dict }) {
  if (!links.website) return null;
  return (
    <div className="offers">
      <div className="offers-objects" aria-hidden="true">
        <img src="/reel/sneaker.webp" alt="" width={360} height={360} />
        <img src="/reel/ballon.webp" alt="" width={360} height={360} />
        <img src="/reel/basket.webp" alt="" width={360} height={360} />
      </div>
      <h2>{t.offersTitle}</h2>
      <p>{t.offersText}</p>
      <a className="btn btn-yellow" href={links.website} target="_blank" rel="noopener noreferrer">
        {t.offersBtn}
      </a>
    </div>
  );
}

function whatsappLink(number: string, message: string): string | null {
  let digits = number.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = `212${digits.slice(1)}`;
  return digits.length >= 9 ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}` : null;
}

export default function Game({ initial }: { initial: GameState }) {
  const { store: shop, min_age: minAge } = initial;
  const place = shop.store_name ? `${shop.store_name}, ${shop.city}` : shop.city;
  const links: LinkSet = { instagram: initial.instagram_url, tiktok: initial.tiktok_url, website: initial.website_url };

  const [lang, setLang] = useState<Lang>('fr');
  const [muted, setMuted] = useState(false);
  const [me, setMe] = useState<Me | null>(initial.me);
  const [status, setStatus] = useState<StoreStatus>(initial.status);
  const [screen, setScreen] = useState<Screen>(() => (initial.me?.played ? (initial.me.won ? 'won' : 'lost') : 'lang'));
  const [firstName, setFirstName] = useState(initial.me?.first_name ?? '');
  const [participantId, setParticipantId] = useState(initial.me?.id ?? '');

  const [form, setForm] = useState({ fullName: '', age: '', phone: '', email: '', consent: false, marketingOptIn: false });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [ageLimit, setAgeLimit] = useState(minAge);
  const [formError, setFormError] = useState<'' | 'phone_used' | 'rate' | 'unknown'>('');
  const [sending, setSending] = useState(false);

  const [phase, setPhase] = useState<Phase>('idle');
  const [strips, setStrips] = useState<Sym[][]>(IDLE);
  const [pulled, setPulled] = useState(false);
  const [flashWin, setFlashWin] = useState(false);
  const [spinError, setSpinError] = useState(false);
  const spinning = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const meRef = useRef(me);
  meRef.current = me;

  const t = DICTS[lang];

  /** Écran où envoyer le joueur une fois la langue connue. */
  function entryScreen(m: Me | null, s: StoreStatus): Screen {
    if (m?.played) return m.won ? 'won' : 'lost';
    if (s !== 'ok') return 'closed';
    return m ? 'machine' : 'intro';
  }

  // Préférences gardées par le navigateur, et identifiant d'appareil si le cookie a disparu.
  useEffect(() => {
    const m = load(MUTE_KEY) === '1';
    setMuted(m);
    sound.setMuted(m);
    const storedLang = load(LANG_KEY);
    if (storedLang === 'fr' || storedLang === 'ar') {
      setLang(storedLang);
      setScreen((cur) => (cur === 'lang' ? entryScreen(meRef.current, initial.status) : cur));
    }
    const id = load(DEVICE_KEY);
    if (!id || initial.me) return;
    resume(shop.slug, id)
      .then((found) => {
        if (!found) return;
        setMe(found);
        setFirstName(found.first_name);
        setParticipantId(found.id);
        setScreen((cur) => (found.played ? (found.won ? 'won' : 'lost') : cur === 'intro' ? 'machine' : cur));
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    window.scrollTo(0, 0);
    heading.current?.focus({ preventScroll: true });
  }, [screen]);

  function chooseLang(l: Lang) {
    setLang(l);
    save(LANG_KEY, l);
    if (screen === 'lang') setScreen(entryScreen(me, status));
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    sound.setMuted(next);
    save(MUTE_KEY, next ? '1' : '0');
  }

  function showResult(result: Me) {
    setMe(result);
    setFirstName(result.first_name);
    setScreen(result.won ? 'won' : 'lost');
  }

  async function onRegister(e: React.FormEvent) {
    e.preventDefault();
    if (sending) return;
    setSending(true);
    setFormError('');
    setFieldErrors({});
    let res: RegisterResult;
    try {
      res = await register({ slug: shop.slug, ...form, lang, deviceId: load(DEVICE_KEY), fingerprint: fingerprint() });
    } catch {
      res = { ok: false, error: 'unknown' };
    }
    setSending(false);

    if (res.ok) {
      save(DEVICE_KEY, res.deviceId);
      setParticipantId(res.participantId);
      setFirstName(form.fullName.trim().split(/\s+/)[0] ?? '');
      setStrips(IDLE);
      setScreen('machine');
      return;
    }
    if (res.error === 'fields') {
      setFieldErrors(res.fields);
      if (res.minAge) setAgeLimit(res.minAge);
      document.getElementById(`f-${Object.keys(res.fields)[0]}`)?.focus();
    } else if (res.error === 'already_played') {
      save(DEVICE_KEY, res.deviceId);
      showResult(res.me);
    } else if (res.error === 'closed') {
      setStatus(res.status);
      setScreen('closed');
    } else {
      setFormError(res.error);
    }
  }

  async function onSpin() {
    if (spinning.current) return;
    spinning.current = true;
    setSpinError(false);
    setPulled(true);
    sound.unlock();
    sound.lever();
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!calm) {
      setStrips(JACKPOT.map(() => loopStrip()));
      setPhase('loop');
      sound.startTicks();
    }
    const started = Date.now();
    let res: Awaited<ReturnType<typeof spin>>;
    try {
      res = await spin(participantId);
    } catch {
      res = { ok: false, error: 'unknown' };
    }

    if (!res.ok) {
      sound.stopTicks();
      setPhase('idle');
      setStrips(IDLE);
      setPulled(false);
      spinning.current = false;
      if (res.error === 'closed') {
        setStatus(res.status);
        setScreen('closed');
      } else if (res.error === 'not_found') {
        setScreen('form');
      } else {
        setSpinError(true);
      }
      return;
    }

    const result = res.me;
    const line = result.won ? JACKPOT : losingLine();
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

    if (calm) {
      setStrips(line.map((s, i) => [IDLE[i][0], s, IDLE[i][2]]));
    } else {
      await wait(Math.max(0, 1000 - (Date.now() - started)));
      setStrips(
        line.map((final, i) => [...Array.from({ length: 14 + i * 6 }, () => pick(ALL)), final, pick(OBJECTS)]),
      );
      setPhase('land');
      LAND_MS.forEach((ms, i) =>
        setTimeout(() => {
          sound.reelStop();
          if (i === LAND_MS.length - 1) sound.stopTicks();
        }, ms),
      );
      await wait(LAND_MS[2] + 250);
    }
    setFlashWin(result.won);
    if (result.won) sound.win();
    else sound.lose();
    await wait(result.won ? 1200 : 900);
    spinning.current = false;
    showResult(result);
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const fieldError = (k: keyof FieldErrors) => {
    const code = fieldErrors[k];
    return code ? fill(t.errors[code], { n: ageLimit }) : '';
  };

  const closed = closedCopy(t, lang, status, {
    city: shop.city,
    startsAt: initial.starts_at,
    open: initial.open_time,
    close: initial.close_time,
  });
  const busy = phase !== 'idle';
  const comma = lang === 'ar' ? '، ' : ', ';
  const wa =
    me?.win_code && initial.whatsapp_number
      ? whatsappLink(initial.whatsapp_number, fill(t.waMessage, { place, code: me.win_code }))
      : null;
  const rulesHref = `/reglement?lang=${lang}`;

  return (
    <main className="stage" lang={lang} dir={lang === 'ar' ? 'rtl' : 'ltr'} data-mood={screen === 'won' ? 'win' : undefined}>
      {screen !== 'lang' && (
        <div className="stage-tools" dir="ltr">
          <button type="button" className="tool" onClick={() => chooseLang(lang === 'fr' ? 'ar' : 'fr')} lang={lang === 'fr' ? 'ar' : 'fr'}>
            {lang === 'fr' ? 'العربية' : 'Français'}
          </button>
          <button type="button" className="tool tool-icon" onClick={toggleMute} aria-label={muted ? t.soundOn : t.soundOff} aria-pressed={muted}>
            {muted ? ICONS.soundOff : ICONS.soundOn}
          </button>
        </div>
      )}

      <header className="stage-top">
        <img
          className="stage-logo"
          src={screen === 'won' ? '/brand/planet-sport-white.png' : '/brand/planet-sport-black.png'}
          alt="Planet Sport"
          width={785}
          height={118}
        />
        <p className="stage-place" dir="ltr">
          {place}
        </p>
      </header>

      {screen === 'lang' && (
        <div className="stage-body">
          <div className="hero">
            <p className="hero-number hero-number-sm" dir="ltr">
              100K
            </p>
          </div>
          <h1 className="langs-title" ref={heading} tabIndex={-1}>
            <span lang="fr">Choisissez votre langue</span>
            <span lang="ar" dir="rtl">
              اختر لغتك
            </span>
          </h1>
          <div className="langs">
            <button className="btn" lang="fr" onClick={() => chooseLang('fr')}>
              Français
            </button>
            <button className="btn btn-ar" lang="ar" dir="rtl" onClick={() => chooseLang('ar')}>
              العربية
            </button>
          </div>
        </div>
      )}

      {screen === 'intro' && (
        <div className="stage-body">
          <div className="hero">
            <p className="hero-kicker">{t.kicker}</p>
            <h1 className="hero-number" ref={heading} tabIndex={-1} dir="ltr">
              100K
            </h1>
            <p className="hero-sub">{t.heroSub}</p>
          </div>
          <div className="prize">
            <span className="prize-icon">{ICONS.ticket}</span>
            <span>
              <small>{t.prizeSmall}</small>
              <b>{t.prize}</b>
            </span>
          </div>
          <ol className="how">
            <li>
              <span className="how-icon">{ICONS.form}</span>
              {t.how1}
            </li>
            <li>
              <span className="how-icon">{ICONS.play}</span>
              {t.how2}
            </li>
            <li>
              <span className="how-icon">{ICONS.ticket}</span>
              {t.how3}
            </li>
          </ol>
          <button className="btn" onClick={() => setScreen('form')}>
            {t.join}
          </button>
          <p className="note">{t.introNote}</p>
        </div>
      )}

      {screen === 'form' && (
        <div className="stage-body">
          <h1 className="display display-sm" ref={heading} tabIndex={-1}>
            {t.formTitle}
          </h1>
          <form className="form" onSubmit={onRegister} noValidate>
            <div className="field">
              <label htmlFor="f-fullName">{t.fullName}</label>
              <input
                id="f-fullName"
                className="input"
                autoComplete="name"
                autoCapitalize="words"
                maxLength={80}
                value={form.fullName}
                onChange={set('fullName')}
                aria-invalid={!!fieldErrors.fullName}
                aria-describedby={fieldErrors.fullName ? 'e-fullName' : undefined}
              />
              {fieldErrors.fullName && (
                <p className="field-error" id="e-fullName">
                  {fieldError('fullName')}
                </p>
              )}
            </div>
            <div className="field">
              <label htmlFor="f-age">{t.age}</label>
              <input
                id="f-age"
                className="input"
                dir="ltr"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={3}
                value={form.age}
                onChange={set('age')}
                aria-invalid={!!fieldErrors.age}
                aria-describedby={fieldErrors.age ? 'e-age' : undefined}
              />
              {fieldErrors.age && (
                <p className="field-error" id="e-age">
                  {fieldError('age')}
                </p>
              )}
            </div>
            <div className="field">
              <label htmlFor="f-phone">{t.phone}</label>
              <input
                id="f-phone"
                className="input"
                dir="ltr"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="06 12 34 56 78"
                maxLength={20}
                value={form.phone}
                onChange={set('phone')}
                aria-invalid={!!fieldErrors.phone}
                aria-describedby={fieldErrors.phone ? 'e-phone' : undefined}
              />
              {fieldErrors.phone && (
                <p className="field-error" id="e-phone">
                  {fieldError('phone')}
                </p>
              )}
            </div>
            <div className="field">
              <label htmlFor="f-email">
                {t.email} <span className="hint">{t.optional}</span>
              </label>
              <input
                id="f-email"
                className="input"
                dir="ltr"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                maxLength={120}
                value={form.email}
                onChange={set('email')}
                aria-invalid={!!fieldErrors.email}
                aria-describedby={fieldErrors.email ? 'e-email' : undefined}
              />
              {fieldErrors.email && (
                <p className="field-error" id="e-email">
                  {fieldError('email')}
                </p>
              )}
            </div>
            <div className="field">
              <label className="check">
                <input id="f-consent" type="checkbox" checked={form.consent} onChange={set('consent')} />
                <span>
                  {fill(t.consentBefore, { n: minAge })}
                  <a href={rulesHref} target="_blank" rel="noopener">
                    {t.consentLink}
                  </a>
                  {t.consentAfter}
                </span>
              </label>
              {fieldErrors.consent && <p className="field-error">{fieldError('consent')}</p>}
            </div>
            <label className="check">
              <input type="checkbox" checked={form.marketingOptIn} onChange={set('marketingOptIn')} />
              <span>{t.optin}</span>
            </label>
            {formError && (
              <p className="alert" role="alert">
                {t.errors[formError]}
              </p>
            )}
            <button className="btn" type="submit" disabled={sending}>
              {sending ? t.wait : t.next}
            </button>
          </form>
          <button className="linklike" onClick={() => setScreen('intro')}>
            {t.back}
          </button>
        </div>
      )}

      {screen === 'machine' && (
        <div className="stage-body">
          <h1 className="display display-sm" ref={heading} tabIndex={-1}>
            {firstName ? `${t.machineTitle}${comma}${firstName}` : t.machineTitle}
          </h1>
          <Machine phase={phase} strips={strips} won={flashWin} pulled={pulled} onPull={onSpin} label={t.lever} />
          <p className="lede" aria-live="polite">
            {busy ? t.spinning : t.machineHint}
          </p>
          {spinError && (
            <p className="alert" role="alert">
              {t.errors.unknown}
            </p>
          )}
          <button className="btn" onClick={onSpin} disabled={busy}>
            {busy ? t.startBusy : t.start}
          </button>
        </div>
      )}

      {screen === 'won' && me && (
        <div className="stage-body pop">
          <div className="confetti" aria-hidden="true">
            {Array.from({ length: 28 }, (_, i) => (
              <i
                key={i}
                style={{
                  left: `${(i * 37) % 100}%`,
                  animationDuration: `${2.2 + ((i * 7) % 10) / 6}s`,
                  animationDelay: `${((i * 13) % 10) / 12}s`,
                }}
              />
            ))}
          </div>
          <div className="tiles" aria-hidden="true" dir="ltr">
            {JACKPOT.map((d, i) => (
              <span key={i}>{d}</span>
            ))}
          </div>
          <h1 className="display win-title" ref={heading} tabIndex={-1}>
            {t.winTitle}
            {firstName ? `${comma}${firstName}` : ''} !
          </h1>
          <div className="ticket">
            <p className="ticket-prize">{t.prize}</p>
            <p className="ticket-label">{t.ticketLabel}</p>
            <p className="ticket-code" dir="ltr">
              {me.win_code}
            </p>
            <p className="ticket-meta">{fill(t.ticketMeta, { place })}</p>
            {me.redeemed && <p className="ticket-done">{t.ticketDone}</p>}
          </div>
          {!me.redeemed && (
            <ol className="steps">
              <li>{t.step1}</li>
              <li>{t.step2}</li>
              <li>{t.step3}</li>
            </ol>
          )}
          {wa && !me.redeemed && (
            <a className="btn btn-yellow btn-icon" href={wa} target="_blank" rel="noopener noreferrer">
              {ICONS.whatsapp}
              {t.whatsapp}
            </a>
          )}
          <Socials links={links} t={t} />
        </div>
      )}

      {screen === 'lost' && (
        <div className="stage-body pop">
          <h1 className="display" ref={heading} tabIndex={-1}>
            {t.lostTitle}
          </h1>
          <p className="lede">{fill(t.lostText, { name: firstName ? `${comma}${firstName}` : '' })}</p>
          <Offers links={links} t={t} />
          <Socials links={links} t={t} />
          <p className="note">{t.onePlay}</p>
        </div>
      )}

      {screen === 'closed' && (
        <div className="stage-body">
          <h1 className="display" ref={heading} tabIndex={-1}>
            {closed.title}
          </h1>
          <p className="lede">{closed.text}</p>
          <Offers links={links} t={t} />
          <Socials links={links} t={t} />
        </div>
      )}

      <footer className="stage-foot">
        <a href={rulesHref} target="_blank" rel="noopener">
          {t.rules}
        </a>
      </footer>
    </main>
  );
}
