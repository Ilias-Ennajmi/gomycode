'use client';

import { useEffect, useRef, useState } from 'react';
import type { GameState, Me, StoreStatus } from '@/core/types';
import { register, resume, spin, type RegisterResult } from './actions';

type Sym = '1' | '0' | 'ballon' | 'sneaker' | 'basket' | 'trophee' | 'sifflet';
type Screen = 'intro' | 'form' | 'machine' | 'won' | 'lost' | 'closed';
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

function stored(): string | null {
  try {
    return localStorage.getItem(DEVICE_KEY);
  } catch {
    return null;
  }
}

function store(id: string) {
  try {
    localStorage.setItem(DEVICE_KEY, id);
  } catch {
    /* navigation privée : le cookie suffit */
  }
}

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

function Machine({
  phase,
  strips,
  won,
  pulled,
  onPull,
}: {
  phase: Phase;
  strips: Sym[][];
  won: boolean;
  pulled: boolean;
  onPull: () => void;
}) {
  return (
    <div className="machine-wrap">
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
        aria-label="Tirer le levier pour lancer la machine"
      >
        <span className="lever-base" />
        <span className="lever-arm" />
      </button>
    </div>
  );
}

const ICONS = {
  form: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
    </svg>
  ),
  play: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2.5" y="7" width="15" height="12" rx="2.5" />
      <path d="M7.5 7v12M12.5 7v12M20 15V7" />
      <circle cx="20" cy="5" r="2" fill="currentColor" />
    </svg>
  ),
  ticket: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z" />
      <path d="M14 6v2.5M14 11v2M14 15.5V18" />
    </svg>
  ),
};

function closedCopy(status: StoreStatus, city: string, startsAt: string | null): { title: string; text: string } {
  switch (status) {
    case 'sold_out':
      return {
        title: 'Tous les bons ont été gagnés',
        text: `Les bons d'achat mis en jeu à ${city} ont tous trouvé leur gagnant. Merci d'avoir fêté nos 100K avec nous.`,
      };
    case 'not_started': {
      const when = startsAt
        ? new Intl.DateTimeFormat('fr-FR', {
            dateStyle: 'long',
            timeStyle: 'short',
            timeZone: 'Africa/Casablanca',
          }).format(new Date(startsAt))
        : null;
      return {
        title: 'Le jeu ouvre bientôt',
        text: when ? `Revenez à partir du ${when} pour tenter votre chance.` : 'Revenez très vite pour tenter votre chance.',
      };
    }
    case 'ended':
      return { title: 'Le jeu est terminé', text: "Merci à toutes et à tous d'avoir fêté nos 100K avec nous." };
    default:
      return {
        title: 'Le jeu est en pause',
        text: `Le jeu n'est pas ouvert à ${city} pour le moment. Demandez à l'équipe du magasin ou réessayez un peu plus tard.`,
      };
  }
}

const GENERAL_ERRORS: Record<string, string> = {
  phone_used: 'Ce numéro de téléphone a déjà participé. Une seule participation par personne.',
  rate: 'Trop de tentatives depuis cette connexion. Réessayez dans quelques minutes.',
  unknown: 'Un problème est survenu. Vérifiez votre connexion et réessayez.',
};

export default function Game({ initial }: { initial: GameState }) {
  const { store: shop, min_age: minAge, instagram_url: instagram } = initial;
  const place = shop.store_name ? `${shop.store_name}, ${shop.city}` : shop.city;

  const [me, setMe] = useState<Me | null>(initial.me);
  const [status, setStatus] = useState<StoreStatus>(initial.status);
  const [screen, setScreen] = useState<Screen>(() => {
    if (initial.me?.played) return initial.me.won ? 'won' : 'lost';
    if (initial.status !== 'ok') return 'closed';
    return initial.me ? 'machine' : 'intro';
  });
  const [firstName, setFirstName] = useState(initial.me?.first_name ?? '');
  const [participantId, setParticipantId] = useState(initial.me?.id ?? '');

  const [form, setForm] = useState({ fullName: '', age: '', phone: '', email: '', consent: false });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [sending, setSending] = useState(false);

  const [phase, setPhase] = useState<Phase>('idle');
  const [strips, setStrips] = useState<Sym[][]>(IDLE);
  const [pulled, setPulled] = useState(false);
  const [flashWin, setFlashWin] = useState(false);
  const [spinError, setSpinError] = useState('');
  const spinning = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);

  // Cookie effacé mais identifiant encore présent dans le navigateur.
  useEffect(() => {
    const id = stored();
    if (!id || initial.me) return;
    resume(shop.slug, id)
      .then((found) => {
        if (!found) return;
        setMe(found);
        setFirstName(found.first_name);
        setParticipantId(found.id);
        if (found.played) setScreen(found.won ? 'won' : 'lost');
      })
      .catch(() => {});
  }, [initial.me, shop.slug]);

  useEffect(() => {
    window.scrollTo(0, 0);
    heading.current?.focus({ preventScroll: true });
  }, [screen]);

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
      res = await register({ slug: shop.slug, ...form, deviceId: stored(), fingerprint: fingerprint() });
    } catch {
      res = { ok: false, error: 'unknown' };
    }
    setSending(false);

    if (res.ok) {
      store(res.deviceId);
      setParticipantId(res.participantId);
      setFirstName(form.fullName.trim().split(/\s+/)[0] ?? '');
      setStrips(IDLE);
      setScreen('machine');
      return;
    }
    if (res.error === 'fields') {
      setFieldErrors(res.fields);
      const firstBad = Object.keys(res.fields)[0];
      document.getElementById(`f-${firstBad}`)?.focus();
    } else if (res.error === 'already_played') {
      store(res.deviceId);
      showResult(res.me);
    } else if (res.error === 'closed') {
      setStatus(res.status);
      setScreen('closed');
    } else {
      setFormError(GENERAL_ERRORS[res.error]);
    }
  }

  async function onSpin() {
    if (spinning.current) return;
    spinning.current = true;
    setSpinError('');
    setPulled(true);
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!calm) {
      setStrips(JACKPOT.map(() => loopStrip()));
      setPhase('loop');
    }
    const started = Date.now();
    let res: Awaited<ReturnType<typeof spin>>;
    try {
      res = await spin(participantId);
    } catch {
      res = { ok: false, error: 'unknown' };
    }

    if (!res.ok) {
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
        setSpinError(GENERAL_ERRORS.unknown);
      }
      return;
    }

    const result = res.me;
    const line = result.won ? JACKPOT : losingLine();
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

    if (calm) {
      setStrips(line.map((s, i) => [IDLE[i][0], s, IDLE[i][2]]));
      setFlashWin(result.won);
      await wait(900);
    } else {
      await wait(Math.max(0, 1000 - (Date.now() - started)));
      setStrips(
        line.map((final, i) => [...Array.from({ length: 14 + i * 6 }, () => pick(ALL)), final, pick(OBJECTS)]),
      );
      setPhase('land');
      await wait(LAND_MS[2] + 250);
      setFlashWin(result.won);
      await wait(result.won ? 1100 : 800);
    }
    spinning.current = false;
    showResult(result);
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const closed = closedCopy(status, shop.city, initial.starts_at);
  const busy = phase !== 'idle';

  return (
    <main className="stage" data-mood={screen === 'won' ? 'win' : undefined}>
      <header className="stage-top">
        <img className="stage-logo" src={screen === 'won' ? '/brand/planet-sport-white.png' : '/brand/planet-sport-black.png'} alt="Planet Sport" width={785} height={118} />
        <p className="stage-place">{place}</p>
      </header>

      {screen === 'intro' && (
        <div className="stage-body">
          <div className="hero">
            <p className="hero-kicker">Merci pour les</p>
            <h1 className="hero-number" ref={heading} tabIndex={-1}>
              100K
            </h1>
            <p className="hero-sub">abonnés sur Instagram</p>
          </div>
          <div className="prize">
            <span className="prize-icon">{ICONS.ticket}</span>
            <span>
              <small>À gagner dans ce magasin</small>
              <b>Bon d&apos;achat de 1000 DH</b>
            </span>
          </div>
          <ol className="how">
            <li>
              <span className="how-icon">{ICONS.form}</span>
              Inscrivez-vous
            </li>
            <li>
              <span className="how-icon">{ICONS.play}</span>
              Lancez la machine
            </li>
            <li>
              <span className="how-icon">{ICONS.ticket}</span>
              Alignez 1 · 0 · 0
            </li>
          </ol>
          <button className="btn" onClick={() => setScreen('form')}>
            Je participe
          </button>
          <p className="note">Une seule tentative par personne. Les gagnants sont pris en photo en magasin.</p>
        </div>
      )}

      {screen === 'form' && (
        <div className="stage-body">
          <h1 className="display display-sm" ref={heading} tabIndex={-1}>
            Vos informations
          </h1>
          <form className="form" onSubmit={onRegister} noValidate>
            <div className="field">
              <label htmlFor="f-fullName">Nom complet</label>
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
                  {fieldErrors.fullName}
                </p>
              )}
            </div>
            <div className="field">
              <label htmlFor="f-age">Âge</label>
              <input
                id="f-age"
                className="input"
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
                  {fieldErrors.age}
                </p>
              )}
            </div>
            <div className="field">
              <label htmlFor="f-phone">Numéro de téléphone</label>
              <input
                id="f-phone"
                className="input"
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
                  {fieldErrors.phone}
                </p>
              )}
            </div>
            <div className="field">
              <label htmlFor="f-email">
                Email <span className="hint">(facultatif)</span>
              </label>
              <input
                id="f-email"
                className="input"
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
                  {fieldErrors.email}
                </p>
              )}
            </div>
            <div className="field">
              <label className="check">
                <input id="f-consent" type="checkbox" checked={form.consent} onChange={set('consent')} />
                <span>
                  J&apos;ai {minAge} ans ou plus, j&apos;accepte le{' '}
                  <a href="/reglement" target="_blank" rel="noopener">
                    règlement du jeu
                  </a>{' '}
                  et l&apos;utilisation de mes informations par Planet Sport pour gérer ma participation.
                </span>
              </label>
              {fieldErrors.consent && <p className="field-error">{fieldErrors.consent}</p>}
            </div>
            {formError && (
              <p className="alert" role="alert">
                {formError}
              </p>
            )}
            <button className="btn" type="submit" disabled={sending}>
              {sending ? 'Un instant…' : 'Suivant'}
            </button>
          </form>
          <button className="linklike" onClick={() => setScreen('intro')}>
            Retour
          </button>
        </div>
      )}

      {screen === 'machine' && (
        <div className="stage-body">
          <h1 className="display display-sm" ref={heading} tabIndex={-1}>
            {firstName ? `À vous de jouer, ${firstName}` : 'À vous de jouer'}
          </h1>
          <Machine phase={phase} strips={strips} won={flashWin} pulled={pulled} onPull={onSpin} />
          <p className="lede" aria-live="polite">
            {busy
              ? 'La machine tourne…'
              : 'Une seule tentative. Alignez 1, 0, 0 et le bon de 1000 DH est à vous.'}
          </p>
          {spinError && (
            <p className="alert" role="alert">
              {spinError}
            </p>
          )}
          <button className="btn" onClick={onSpin} disabled={busy}>
            {busy ? 'Ça tourne…' : 'Je démarre'}
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
          <div className="tiles" aria-hidden="true">
            {JACKPOT.map((d, i) => (
              <span key={i}>{d}</span>
            ))}
          </div>
          <h1 className="display win-title" ref={heading} tabIndex={-1}>
            Félicitations{firstName ? `, ${firstName}` : ''} !
          </h1>
          <div className="ticket">
            <p className="ticket-prize">Bon d&apos;achat de 1000 DH</p>
            <p className="ticket-label">Votre code gagnant</p>
            <p className="ticket-code">{me.win_code}</p>
            <p className="ticket-meta">À présenter chez Planet Sport {place}</p>
            {me.redeemed && <p className="ticket-done">Ce bon a déjà été remis.</p>}
          </div>
          {!me.redeemed && (
            <ol className="steps">
              <li>Faites une capture d&apos;écran de ce code.</li>
              <li>Présentez-le en caisse, avec ce téléphone et une pièce d&apos;identité.</li>
              <li>Souriez : une photo sera prise en magasin pour notre Instagram.</li>
            </ol>
          )}
          {instagram && (
            <a className="btn btn-yellow" href={instagram} target="_blank" rel="noopener noreferrer">
              Suivre Planet Sport
            </a>
          )}
        </div>
      )}

      {screen === 'lost' && (
        <div className="stage-body pop">
          <h1 className="display" ref={heading} tabIndex={-1}>
            Pas cette fois
          </h1>
          <p className="lede">
            La machine n&apos;a pas aligné 1, 0, 0. Merci d&apos;avoir joué{firstName ? `, ${firstName}` : ''}, et merci
            de faire partie de nos 100 000 abonnés.
          </p>
          {instagram && (
            <a className="btn" href={instagram} target="_blank" rel="noopener noreferrer">
              Suivre Planet Sport
            </a>
          )}
          <p className="note">Une seule participation par personne.</p>
        </div>
      )}

      {screen === 'closed' && (
        <div className="stage-body">
          <h1 className="display" ref={heading} tabIndex={-1}>
            {closed.title}
          </h1>
          <p className="lede">{closed.text}</p>
          {instagram && (
            <a className="btn" href={instagram} target="_blank" rel="noopener noreferrer">
              Suivre Planet Sport
            </a>
          )}
        </div>
      )}

      <footer className="stage-foot">
        <a href="/reglement" target="_blank" rel="noopener">
          Règlement du jeu
        </a>
      </footer>
    </main>
  );
}
