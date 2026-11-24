import { headers } from 'next/headers';
import { rpc } from '@/core/db';
import type { AdminOverview, AdminStore, StoreStatus } from '@/core/types';
import { saveStore, setCampaign, setStoreActive } from '../actions';
import { CopyButton } from '../_ui/Buttons';

const FLASH: Record<string, string> = {
  campaign: 'Le jeu a été mis à jour.',
  store: 'Le magasin a été mis à jour.',
  saved: 'Modifications enregistrées.',
  created: 'Magasin ajouté. Il est inactif tant que vous ne l’activez pas.',
};

const ERRORS: Record<string, string> = {
  invalid: 'Certaines valeurs ne sont pas valides. Vérifiez la chance de gain, le nombre de bons et le code magasin (6 chiffres).',
  slug_taken: 'Ce lien est déjà utilisé par un autre magasin. Choisissez-en un autre.',
  below_winners: 'Le nombre de bons ne peut pas être inférieur au nombre de bons déjà gagnés dans ce magasin.',
  not_found: 'Ce magasin est introuvable.',
};

const STATUS: Record<StoreStatus, { label: string; tone: string }> = {
  ok: { label: 'En cours', tone: 'ok' },
  paused: { label: 'Désactivé', tone: 'warn' },
  not_started: { label: 'Pas encore ouvert', tone: 'warn' },
  ended: { label: 'Terminé', tone: 'dark' },
  sold_out: { label: 'Tous les bons gagnés', tone: 'dark' },
};

const percent = (ratio: number) => String(Math.round(ratio * 100000) / 1000).replace('.', ',');

function odds(ratio: number): string {
  if (ratio <= 0) return 'Personne ne peut gagner.';
  if (ratio >= 1) return 'Chaque partie gagne.';
  return `Environ 1 gagnant toutes les ${Math.round(1 / ratio)} parties.`;
}

function StoreForm({ s }: { s?: AdminStore }) {
  return (
    <form action={saveStore} style={{ display: 'grid', gap: 12 }}>
      <input type="hidden" name="id" value={s?.id ?? ''} />
      <div className="grid2">
        <label className="f">
          Ville
          <input name="city" defaultValue={s?.city} maxLength={60} required />
        </label>
        <label className="f">
          Nom du magasin <small>Facultatif, par exemple Morocco Mall.</small>
          <input name="store_name" defaultValue={s?.store_name} maxLength={80} />
        </label>
        <label className="f">
          Bons d&apos;achat à gagner
          <input name="prizes_total" type="number" min={0} max={1000} defaultValue={s?.prizes_total ?? 1} required />
        </label>
        <label className="f">
          Chance de gain par partie (%)
          <input name="chance" inputMode="decimal" defaultValue={s ? percent(s.win_probability) : '2'} required />
        </label>
        {s ? (
          <label className="f">
            Code magasin <small>6 chiffres, pour la remise des bons.</small>
            <input name="staff_pin" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} defaultValue={s.staff_pin} required />
          </label>
        ) : (
          <label className="f">
            Fin du lien <small>Laissez vide pour utiliser la ville.</small>
            <input name="slug" maxLength={40} placeholder="casablanca-morocco-mall" />
          </label>
        )}
      </div>
      <div>
        <button className="b b-dark">{s ? 'Enregistrer' : 'Ajouter le magasin'}</button>
      </div>
    </form>
  );
}

export default async function Stores({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { ok, err } = await searchParams;
  const { settings, stores } = await rpc<AdminOverview>('admin_overview');
  const h = await headers();
  const origin = `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('host')}`;

  const sum = (k: 'registered' | 'played' | 'winners' | 'redeemed' | 'prizes_total') =>
    stores.reduce((n, s) => n + Number(s[k]), 0);

  return (
    <>
      <div className="bo-head">
        <h1>Magasins</h1>
        <form action={setCampaign} className="row">
          <span className="badge" data-tone={settings.campaign_active ? 'ok' : 'red'}>
            {settings.campaign_active ? 'Jeu ouvert' : 'Jeu arrêté partout'}
          </span>
          <input type="hidden" name="active" value={String(!settings.campaign_active)} />
          <button className={settings.campaign_active ? 'b' : 'b b-red'}>
            {settings.campaign_active ? 'Arrêter le jeu partout' : 'Rouvrir le jeu'}
          </button>
        </form>
      </div>

      {ok && FLASH[ok] && (
        <p className="flash" role="status">
          {FLASH[ok]}
        </p>
      )}
      {err && (
        <p className="flash" data-tone="err" role="alert">
          {ERRORS[err] ?? ERRORS.invalid}
        </p>
      )}

      <div className="kpis">
        <div className="kpi">
          <b>{sum('registered')}</b>
          <span>inscrits</span>
        </div>
        <div className="kpi">
          <b>{sum('played')}</b>
          <span>parties jouées</span>
        </div>
        <div className="kpi">
          <b>
            {sum('winners')}/{sum('prizes_total')}
          </b>
          <span>bons gagnés</span>
        </div>
        <div className="kpi">
          <b>{sum('redeemed')}</b>
          <span>bons remis en magasin</span>
        </div>
      </div>

      <div className="stores">
        {stores.map((s) => {
          const link = `${origin}/jeu/${s.slug}`;
          const st = STATUS[s.status];
          return (
            <section className="store" key={s.id} data-off={!s.active}>
              <div className="store-head">
                <div>
                  <h2 className="store-city">{s.city}</h2>
                  {s.store_name && <p className="store-sub">{s.store_name}</p>}
                </div>
                <span className="badge" data-tone={st.tone}>
                  {st.label}
                </span>
              </div>

              <div>
                <div className="meter" aria-hidden="true">
                  <i style={{ width: `${s.prizes_total ? Math.min(100, (s.winners / s.prizes_total) * 100) : 0}%` }} />
                </div>
                <p className="store-sub" style={{ marginTop: 6 }}>
                  {s.winners} bon{s.winners > 1 ? 's' : ''} gagné{s.winners > 1 ? 's' : ''} sur {s.prizes_total},
                  dont {s.redeemed} remis
                </p>
              </div>

              <dl className="facts">
                <div>
                  <dt>Inscrits</dt>
                  <dd>{s.registered}</dd>
                </div>
                <div>
                  <dt>Parties</dt>
                  <dd>{s.played}</dd>
                </div>
                <div>
                  <dt>Chance</dt>
                  <dd>{percent(s.win_probability)} %</dd>
                </div>
              </dl>
              <p className="store-sub">
                {odds(s.win_probability)} Code magasin : <strong>{s.staff_pin}</strong>
              </p>

              <div className="linkrow">
                <code>{link}</code>
                <CopyButton text={link} />
              </div>

              <div className="row">
                <form action={setStoreActive}>
                  <input type="hidden" name="id" value={s.id} />
                  <input type="hidden" name="active" value={String(!s.active)} />
                  <button className={s.active ? 'b' : 'b b-red'}>{s.active ? 'Désactiver' : 'Activer'}</button>
                </form>
                <a className="b b-quiet" href={`/admin/qr/${s.slug}`} download={`qr-100k-${s.slug}.png`}>
                  QR code
                </a>
                <a className="b b-quiet" href={`/admin/participants?store=${s.id}`}>
                  Participants
                </a>
              </div>

              <details className="edit">
                <summary>Modifier les lots et la chance de gain</summary>
                <StoreForm s={s} />
              </details>
            </section>
          );
        })}
      </div>

      <section className="panel">
        <h2>Ajouter un magasin</h2>
        <StoreForm />
      </section>

      <section className="panel">
        <h2>Remise des bons en magasin</h2>
        <p>
          Les équipes en magasin vérifient un code gagnant et marquent le bon comme remis sur cette page, avec le
          code de leur magasin.
        </p>
        <div className="linkrow">
          <code>{origin}/validation</code>
          <CopyButton text={`${origin}/validation`} />
        </div>
      </section>
    </>
  );
}
