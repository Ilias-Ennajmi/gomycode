import { Fragment } from 'react';
import { headers } from 'next/headers';
import { rpc } from '@/core/db';
import type { AdminOverview, StoreStatus } from '@/core/types';
import { backupsEnabled, listBackups } from '@/core/backup';
import { backupNow, newPin, saveSettings, saveStore, setCampaign, setStoreActive } from '../actions';
import { CopyButton } from '../_ui/Buttons';

const FLASH: Record<string, string> = {
  campaign: 'Le jeu a été mis à jour.',
  store: 'La ville a été mise à jour.',
  saved: 'Modifications enregistrées.',
  settings: 'Réglages généraux enregistrés.',
  pin: 'Nouveau code magasin généré. Pensez à le transmettre au magasin.',
  backup: 'Sauvegarde enregistrée.',
  created: 'Ville ajoutée. Elle est inactive tant que vous ne l’activez pas.',
};

const ERRORS: Record<string, string> = {
  invalid: 'Certaines valeurs ne sont pas valides. Vérifiez la chance de gain, le nombre de bons et le code magasin (6 chiffres).',
  settings: 'Réglages non enregistrés. Les liens doivent commencer par https:// et le numéro WhatsApp ne contenir que des chiffres.',
  window: 'Créneau non valide. Indiquez l’ouverture et la fermeture, avec la montée de la chance entre les deux.',
  backup: 'La sauvegarde n’a pas pu être enregistrée.',
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
  off_hours: { label: 'Hors horaires', tone: 'warn' },
  day_done: { label: 'Bon du jour gagné', tone: 'dark' },
};

const percent = (ratio: number) => String(Math.round(ratio * 100000) / 1000).replace('.', ',');

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { ok, err } = await searchParams;
  const { settings, stores } = await rpc<AdminOverview>('admin_overview');
  const h = await headers();
  const origin = `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('host')}`;
  const backups = backupsEnabled() ? await listBackups().catch(() => []) : [];

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
          <label className="f">
            Lien TikTok
            <input type="url" name="tiktok_url" defaultValue={settings.tiktok_url} placeholder="https://www.tiktok.com/@…" />
          </label>
          <label className="f">
            Site web (offres)
            <input type="url" name="website_url" defaultValue={settings.website_url} placeholder="https://planetsport.ma/" />
          </label>
          <label className="f">
            WhatsApp Planet Sport
            <input type="tel" name="whatsapp_number" defaultValue={settings.whatsapp_number} placeholder="06 12 34 56 78" />
          </label>
          <button className="b b-dark" style={{ height: 42 }}>
            Enregistrer
          </button>
        </form>
        <p style={{ color: 'var(--smoke)', fontSize: 13.5 }}>
          Dates vides : le jeu est ouvert sans limite. Les liens apparaissent sur les écrans de fin de partie ; un
          champ vide masque le bouton. Avec un numéro WhatsApp, le gagnant peut vous envoyer son code en un geste.
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
                  <Fragment key={s.id}>
                  <tr className="main" data-off={!s.active}>
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
                      <div className="row row-tight">
                        <input form={fid} className="cellinput pin" name="staff_pin" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} defaultValue={s.staff_pin} required aria-label={`Code magasin, ${s.city}`} />
                        <form action={newPin}>
                          <input type="hidden" name="id" value={s.id} />
                          <button className="b b-quiet" title="Générer un nouveau code magasin">
                            Nouveau
                          </button>
                        </form>
                      </div>
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
                  <tr className="sub" data-off={!s.active}>
                    <td colSpan={12}>
                      <div className="window">
                        <strong>Créneau de gain</strong>
                        <label>
                          Ouverture
                          <input form={fid} className="cellinput" type="time" name="open_time" defaultValue={s.open_time} />
                        </label>
                        <label>
                          La chance monte à partir de
                          <input form={fid} className="cellinput" type="time" name="boost_time" defaultValue={s.boost_time} />
                        </label>
                        <label>
                          Fermeture
                          <input form={fid} className="cellinput" type="time" name="close_time" defaultValue={s.close_time} />
                        </label>
                        <label>
                          Gagnants par jour
                          <input form={fid} className="cellinput num" type="number" name="daily_quota" min={1} max={100} defaultValue={s.daily_quota} />
                        </label>
                        <span className="window-note">
                          {s.open_time
                            ? `Aujourd’hui : ${s.wins_today} gagnant${s.wins_today > 1 ? 's' : ''} sur ${s.daily_quota}. Chance en ce moment : ${percent(s.chance_now)} %.`
                            : 'Sans créneau : ouvert toute la journée, chance fixe.'}
                        </span>
                      </div>
                    </td>
                  </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <p style={{ color: 'var(--smoke)', fontSize: 13.5 }}>
          Chance de gain : 2 % correspond à environ un gagnant toutes les 50 parties. Avec un créneau, la chance
          reste à ce niveau jusqu’à l’heure de montée, puis grimpe jusqu’à 100 % à la fermeture : le bon du jour part
          donc avant la fin, le plus souvent dans la dernière partie du créneau. Une fois le nombre de gagnants du
          jour atteint, la ville se ferme jusqu’au lendemain. Cliquez sur Enregistrer après chaque modification.
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
        <h2>Sauvegardes</h2>
        {backupsEnabled() ? (
          <>
            <p>
              Une copie complète des participants est enregistrée chaque nuit hors de la base de données, et à
              chaque fois que vous cliquez ci-dessous.
            </p>
            <div className="row">
              <form action={backupNow}>
                <button className="b b-dark">Sauvegarder maintenant</button>
              </form>
              {backups.slice(0, 10).map((b) => (
                <a key={b.day} className="b b-quiet" href={`/admin/sauvegarde?jour=${b.day}`}>
                  {b.day.split('-').reverse().join('/')}
                </a>
              ))}
            </div>
          </>
        ) : (
          <p>Le stockage des sauvegardes n’est pas encore relié. Utilisez « Exporter pour Excel » dans Participants.</p>
        )}
      </section>

      <section className="panel">
        <h2>Remise des bons en magasin</h2>
        <p>
          Le responsable du magasin ouvre cette page, saisit le code du magasin et le code gagnant du client, puis
          écrit son nom pour confirmer la remise après la photo. Son nom apparaît dans Participants.
        </p>
        <div className="linkrow">
          <code>{origin}/validation</code>
          <CopyButton text={`${origin}/validation`} />
        </div>
      </section>
    </>
  );
}
