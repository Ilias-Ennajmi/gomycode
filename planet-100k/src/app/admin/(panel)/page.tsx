import { headers } from 'next/headers';
import { rpc } from '@/core/db';
import type { AdminOverview, StoreStatus } from '@/core/types';
import { saveSettings, saveStore, setCampaign, setStoreActive } from '../actions';
import { CopyButton } from '../_ui/Buttons';

const FLASH: Record<string, string> = {
  campaign: 'Le jeu a été mis à jour.',
  store: 'La ville a été mise à jour.',
  saved: 'Modifications enregistrées.',
  settings: 'Réglages généraux enregistrés.',
  created: 'Ville ajoutée. Elle est inactive tant que vous ne l’activez pas.',
};

const ERRORS: Record<string, string> = {
  invalid: 'Certaines valeurs ne sont pas valides. Vérifiez la chance de gain, le nombre de bons et le code magasin (6 chiffres).',
  settings: 'Réglages non enregistrés. Le lien Instagram doit commencer par https:// et l’âge être un nombre.',
  dates: 'La date de fin doit être après la date de début.',
  slug_taken: 'Ce lien est déjà utilisé par une autre ville. Choisissez-en un autre.',
  below_winners: 'Le nombre de bons ne peut pas être inférieur au nombre de bons déjà gagnés dans cette ville.',
  not_found: 'Cette ville est introuvable.',
};

const STATUS: Record<StoreStatus, { label: string; tone: string }> = {
  ok: { label: 'En cours', tone: 'ok' },
  paused: { label: 'Désactivé', tone: 'warn' },
  not_started: { label: 'Pas encore ouvert', tone: 'warn' },
  ended: { label: 'Terminé', tone: 'dark' },
  sold_out: { label: 'Bons épuisés', tone: 'dark' },
};

const percent = (ratio: number) => String(Math.round(ratio * 100000) / 1000).replace('.', ',');

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { ok, err } = await searchParams;
  const { settings, stores } = await rpc<AdminOverview>('admin_overview');
  const h = await headers();
  const origin = `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('host')}`;

  const sum = (k: 'registered' | 'played' | 'winners' | 'redeemed' | 'prizes_total') =>
    stores.reduce((n, s) => n + Number(s[k]), 0);

  return (
    <>
      <div className="bo-head">
        <h1>Tableau de bord</h1>
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
        <div className="kpi" data-tone="dark">
          <b>
            {sum('winners')}/{sum('prizes_total')}
          </b>
          <span>bons gagnés</span>
        </div>
        <div className="kpi">
          <b>{sum('redeemed')}</b>
          <span>bons remis en magasin</span>
        </div>
        <div className="kpi">
          <b>{sum('played')}</b>
          <span>parties jouées</span>
        </div>
        <div className="kpi">
          <b>{sum('registered')}</b>
          <span>inscrits</span>
        </div>
      </div>

      <section className="panel">
        <h2>Réglages généraux</h2>
        <form action={saveSettings} className="settings-line">
          <label className="f">
            Début (heure du Maroc)
            <input type="datetime-local" name="starts_at" defaultValue={settings.starts_at} />
          </label>
          <label className="f">
            Fin (heure du Maroc)
            <input type="datetime-local" name="ends_at" defaultValue={settings.ends_at} />
          </label>
          <label className="f">
            Âge minimum
            <input type="number" name="min_age" min={0} max={99} defaultValue={settings.min_age} required />
          </label>
          <label className="f">
            Lien Instagram
            <input type="url" name="instagram_url" defaultValue={settings.instagram_url} placeholder="https://www.instagram.com/…" />
          </label>
          <button className="b b-dark" style={{ height: 42 }}>
            Enregistrer
          </button>
        </form>
        <p style={{ color: 'var(--smoke)', fontSize: 13.5 }}>
          Dates vides : le jeu est ouvert sans limite. Lien Instagram vide : pas de bouton « Suivre Planet Sport »
          après la partie.
        </p>
      </section>

      <section style={{ display: 'grid', gap: 12 }}>
        <h2>Villes</h2>
        <div className="tablewrap">
          <table className="t stores">
            <thead>
              <tr>
                <th>Ville</th>
                <th>État</th>
                <th>Bons gagnés</th>
                <th className="r">Remis</th>
                <th className="r">Inscrits</th>
                <th className="r">Parties</th>
                <th>Nom du magasin</th>
                <th>Bons à gagner</th>
                <th>Chance (%)</th>
                <th>Code magasin</th>
                <th>Lien et QR code</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {stores.map((s) => {
                const link = `${origin}/jeu/${s.slug}`;
                const st = STATUS[s.status];
                const fid = `s-${s.id}`;
                return (
                  <tr key={s.id} data-off={!s.active}>
                    <td>
                      <a className="city" href={`/admin/participants?store=${s.id}`} title={`Voir les participants de ${s.city}`}>
                        {s.city}
                      </a>
                    </td>
                    <td>
                      <span className="badge" data-tone={st.tone}>
                        {st.label}
                      </span>
                    </td>
                    <td>
                      <div className="row row-tight">
                        <strong>
                          {s.winners}/{s.prizes_total}
                        </strong>
                        <div className="meter" aria-hidden="true">
                          <i style={{ width: `${s.prizes_total ? Math.min(100, (s.winners / s.prizes_total) * 100) : 0}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="r">{s.redeemed}</td>
                    <td className="r">{s.registered}</td>
                    <td className="r">{s.played}</td>
                    <td>
                      <input form={fid} className="cellinput name" name="store_name" defaultValue={s.store_name} maxLength={80} placeholder="Facultatif" aria-label={`Nom du magasin, ${s.city}`} />
                    </td>
                    <td>
                      <input form={fid} className="cellinput num" name="prizes_total" type="number" min={0} max={1000} defaultValue={s.prizes_total} required aria-label={`Bons à gagner, ${s.city}`} />
                    </td>
                    <td>
                      <input form={fid} className="cellinput num" name="chance" inputMode="decimal" defaultValue={percent(s.win_probability)} required aria-label={`Chance de gain en pourcentage, ${s.city}`} />
                    </td>
                    <td>
                      <input form={fid} className="cellinput pin" name="staff_pin" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} defaultValue={s.staff_pin} required aria-label={`Code magasin, ${s.city}`} />
                    </td>
                    <td>
                      <div className="row row-tight">
                        <CopyButton text={link} label="Lien" />
                        <a className="b b-quiet" href={`/admin/qr/${s.slug}`} download={`qr-100k-${s.slug}.png`}>
                          QR code
                        </a>
                      </div>
                    </td>
                    <td>
                      <div className="row row-tight">
                        <form id={fid} action={saveStore}>
                          <input type="hidden" name="id" value={s.id} />
                          <input type="hidden" name="city" value={s.city} />
                          <button className="b b-dark">Enregistrer</button>
                        </form>
                        <form action={setStoreActive}>
                          <input type="hidden" name="id" value={s.id} />
                          <input type="hidden" name="active" value={String(!s.active)} />
                          <button className={s.active ? 'b' : 'b b-red'}>{s.active ? 'Désactiver' : 'Activer'}</button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p style={{ color: 'var(--smoke)', fontSize: 13.5 }}>
          Chance de gain : 2 % correspond à environ un gagnant toutes les 50 parties. Une ville s’arrête toute seule
          quand tous ses bons sont gagnés.
        </p>
      </section>

      <section className="panel">
        <h2>Ajouter une ville</h2>
        <form action={saveStore} className="settings-line">
          <input type="hidden" name="id" value="" />
          <label className="f">
            Ville
            <input name="city" maxLength={60} required />
          </label>
          <label className="f">
            Nom du magasin
            <input name="store_name" maxLength={80} placeholder="Facultatif" />
          </label>
          <label className="f">
            Bons à gagner
            <input name="prizes_total" type="number" min={0} max={1000} defaultValue={1} required />
          </label>
          <label className="f">
            Chance de gain (%)
            <input name="chance" inputMode="decimal" defaultValue="2" required />
          </label>
          <button className="b b-dark" style={{ height: 42 }}>
            Ajouter
          </button>
        </form>
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
