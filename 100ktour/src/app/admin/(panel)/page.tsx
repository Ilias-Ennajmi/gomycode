import { headers } from 'next/headers';
import { rpc } from '@/core/db';
import { backupsEnabled, listBackups } from '@/core/backup';
import type { AdminOverview, AdminSettings, AdminStore, StoreStatus } from '@/core/types';
import { backupNow, deleteStore, newPin, saveSettings, saveStore, setCampaign, setStoreActive } from '../actions';
import { ConfirmSubmit, CopyButton } from '../_ui/Buttons';

const FLASH: Record<string, string> = {
  campaign: 'Le jeu a été mis à jour.',
  store: 'Le magasin a été mis à jour.',
  saved: 'Modifications enregistrées.',
  settings: 'Réglages généraux enregistrés.',
  pin: 'Nouveau code magasin généré. Pensez à le transmettre au magasin.',
  backup: 'Sauvegarde enregistrée.',
  created: 'Magasin ajouté. Il reste désactivé tant que vous ne l’activez pas.',
  deleted: 'Magasin supprimé.',
};

const ERRORS: Record<string, string> = {
  invalid: 'Certaines valeurs ne sont pas valides. Vérifiez la chance de gain, le nombre de bons et le code magasin (6 chiffres).',
  settings: 'Réglages non enregistrés. Les liens doivent commencer par https:// et le numéro WhatsApp ne contenir que des chiffres.',
  dates: 'La date de fin doit être après la date de début.',
  window: 'Créneau non valide. Indiquez l’ouverture et la fermeture, avec la montée de la chance entre les deux.',
  backup: 'La sauvegarde n’a pas pu être enregistrée.',
  slug_taken: 'Ce lien existe déjà. Donnez un nom différent au magasin, ou choisissez une autre fin de lien.',
  below_winners: 'Le nombre de bons ne peut pas être inférieur au nombre de bons déjà gagnés dans ce magasin.',
  has_participants: 'Ce magasin a déjà des participants : il ne peut pas être supprimé. Désactivez-le plutôt.',
  not_found: 'Ce magasin est introuvable.',
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
const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;
const anchor = (city: string) =>
  `ville-${city.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

function Meter({ value, max }: { value: number; max: number }) {
  return (
    <span className="meter" aria-hidden="true">
      <i style={{ width: `${max ? Math.min(100, (value / max) * 100) : 0}%` }} />
    </span>
  );
}

function StoreCard({ s, origin }: { s: AdminStore; origin: string }) {
  const link = `${origin}/jeu/${s.slug}`;
  const st = STATUS[s.status];
  return (
    <article className="store-card" data-off={!s.active} id={`magasin-${s.slug}`}>
      <header className="store-card-head">
        <div className="store-card-title">
          <h3>{s.store_name || 'Magasin principal'}</h3>
          <span className="badge" data-tone={st.tone}>
            {st.label}
          </span>
        </div>
        <div className="row">
          <CopyButton text={link} label="Copier le lien" />
          <a className="b b-quiet" href={`/admin/qr/${s.slug}`} download={`qr-100ktour-${s.slug}.png`}>
            QR code
          </a>
          <a className="b b-quiet" href={`/admin/participants?store=${s.id}`}>
            Participants
          </a>
          <form action={setStoreActive}>
            <input type="hidden" name="id" value={s.id} />
            <input type="hidden" name="city" value={s.city} />
            <input type="hidden" name="active" value={String(!s.active)} />
            <button className={s.active ? 'b' : 'b b-red'}>{s.active ? 'Désactiver' : 'Activer'}</button>
          </form>
        </div>
      </header>

      <dl className="store-stats">
        <div>
          <dt>Bons gagnés</dt>
          <dd>
            {s.winners}/{s.prizes_total} <Meter value={s.winners} max={s.prizes_total} />
          </dd>
        </div>
        <div>
          <dt>Remis</dt>
          <dd>{s.redeemed}</dd>
        </div>
        <div>
          <dt>Parties aujourd’hui</dt>
          <dd>{s.played_today}</dd>
        </div>
        <div>
          <dt>Parties au total</dt>
          <dd>{s.played}</dd>
        </div>
        <div>
          <dt>Chance en ce moment</dt>
          <dd>{percent(s.chance_now)} %</dd>
        </div>
      </dl>

      <form action={saveStore} className="store-form">
        <input type="hidden" name="id" value={s.id} />
        <input type="hidden" name="city" value={s.city} />
        <fieldset>
          <legend>Magasin et lots</legend>
          <label className="f">
            Nom du magasin
            <input name="store_name" defaultValue={s.store_name} maxLength={80} placeholder="Par exemple Morocco Mall" />
          </label>
          <label className="f">
            Bons à gagner
            <input name="prizes_total" type="number" min={0} max={1000} defaultValue={s.prizes_total} required />
          </label>
          <label className="f">
            Chance de base (%)
            <input name="chance" inputMode="decimal" defaultValue={percent(s.win_probability)} required />
          </label>
          <label className="f">
            Code magasin
            <span className="pin-row">
              <input name="staff_pin" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} defaultValue={s.staff_pin} required />
              <button className="b b-quiet" formAction={newPin} formNoValidate title="Générer un nouveau code à 6 chiffres">
                Nouveau
              </button>
            </span>
          </label>
        </fieldset>
        <fieldset>
          <legend>Créneau de gain</legend>
          <label className="f">
            Ouverture
            <input type="time" name="open_time" defaultValue={s.open_time} />
          </label>
          <label className="f">
            La chance monte dès
            <input type="time" name="boost_time" defaultValue={s.boost_time} />
          </label>
          <label className="f">
            Fermeture
            <input type="time" name="close_time" defaultValue={s.close_time} />
          </label>
          <label className="f">
            Gagnants par jour
            <input type="number" name="daily_quota" min={1} max={100} defaultValue={s.daily_quota} />
          </label>
        </fieldset>
        <p className="store-note">
          {s.open_time
            ? `Ouvert de ${s.open_time} à ${s.close_time}. Aujourd’hui : ${s.wins_today} gagnant${s.wins_today > 1 ? 's' : ''} sur ${s.daily_quota}.`
            : 'Sans créneau : ouvert toute la journée, avec une chance fixe.'}{' '}
          Lien : <code>/jeu/{s.slug}</code>
        </p>
        <div className="row">
          <button className="b b-dark">Enregistrer</button>
          {s.registered === 0 && (
            <ConfirmSubmit
              formAction={deleteStore}
              question={`Supprimer le magasin ${s.store_name || s.city} ? Son lien et son QR code ne fonctionneront plus.`}
            >
              Supprimer ce magasin
            </ConfirmSubmit>
          )}
        </div>
      </form>
    </article>
  );
}

function AddStoreForm({ city }: { city?: string }) {
  return (
    <form action={saveStore} className="add-form">
      <input type="hidden" name="id" value="" />
      {city ? (
        <input type="hidden" name="city" value={city} />
      ) : (
        <label className="f">
          Ville
          <input name="city" maxLength={60} required />
        </label>
      )}
      <label className="f">
        Nom du magasin
        <input name="store_name" maxLength={80} placeholder="Par exemple Anfa Place" required={Boolean(city)} />
      </label>
      <label className="f">
        Bons à gagner
        <input name="prizes_total" type="number" min={0} max={1000} defaultValue={1} required />
      </label>
      <label className="f">
        Chance de base (%)
        <input name="chance" inputMode="decimal" defaultValue="2" required />
      </label>
      <label className="f">
        Fin du lien <small>Facultatif, créée à partir du nom.</small>
        <input name="slug" maxLength={40} placeholder="casablanca-anfa-place" />
      </label>
      <button className="b b-dark">Ajouter</button>
    </form>
  );
}

function SettingsForm({ settings }: { settings: AdminSettings }) {
  return (
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
  );
}

type Search = { ok?: string; err?: string; ville?: string; reglages?: string };

export default async function Dashboard({ searchParams }: { searchParams: Promise<Search> }) {
  const { ok, err, ville, reglages } = await searchParams;
  const { settings, stores } = await rpc<AdminOverview>('admin_overview');
  const h = await headers();
  const origin = `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('host')}`;
  const backups = backupsEnabled() ? await listBackups().catch(() => []) : [];

  // Les magasins regroupés par ville, dans l’ordre du tableau de départ.
  const cities: { city: string; stores: AdminStore[] }[] = [];
  for (const s of stores) {
    const group = cities.find((c) => c.city === s.city);
    if (group) group.stores.push(s);
    else cities.push({ city: s.city, stores: [s] });
  }
  const total = (list: AdminStore[], k: 'registered' | 'played' | 'played_today' | 'winners' | 'redeemed' | 'prizes_total') =>
    list.reduce((n, s) => n + Number(s[k]), 0);
  const settingsOpen = reglages === '1' || ok === 'settings' || err === 'settings' || err === 'dates';

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
            {total(stores, 'winners')}/{total(stores, 'prizes_total')}
          </b>
          <span>bons gagnés</span>
        </div>
        <div className="kpi">
          <b>{total(stores, 'redeemed')}</b>
          <span>bons remis en magasin</span>
        </div>
        <div className="kpi">
          <b>{total(stores, 'played_today')}</b>
          <span>parties aujourd’hui</span>
        </div>
        <div className="kpi">
          <b>{total(stores, 'played')}</b>
          <span>parties au total</span>
        </div>
        <div className="kpi">
          <b>{total(stores, 'registered')}</b>
          <span>inscrits</span>
        </div>
      </div>

      <section className="cities">
        <div className="bo-head">
          <h2>Villes et magasins</h2>
          <div className="row">
            <a className="b b-quiet" href="/admin?ville=*">
              Tout déplier
            </a>
            <a className="b b-quiet" href="/admin">
              Tout replier
            </a>
          </div>
        </div>

        {cities.map(({ city, stores: list }) => {
          const running = list.filter((s) => s.status === 'ok').length;
          const won = total(list, 'winners');
          const prizes = total(list, 'prizes_total');
          return (
            <details key={city} className="city-group" id={anchor(city)} open={ville === '*' || ville === city}>
              <summary>
                <span className="city-name">{city}</span>
                <span className="city-sub">{plural(list.length, 'magasin')}</span>
                <span className="city-won">
                  <strong>
                    {won}/{prizes}
                  </strong>{' '}
                  bons gagnés <Meter value={won} max={prizes} />
                </span>
                <span className="city-sub">{plural(total(list, 'played_today'), 'partie')} aujourd’hui</span>
                <span className="badge" data-tone={running === list.length ? 'ok' : running === 0 ? 'warn' : undefined}>
                  {running === list.length ? 'En cours' : running === 0 ? 'Fermé' : `${running} sur ${list.length} en cours`}
                </span>
                <span className="chevron" aria-hidden="true" />
              </summary>
              <div className="city-body">
                {list.map((s) => (
                  <StoreCard key={s.id} s={s} origin={origin} />
                ))}
                <details className="add-store">
                  <summary>Ajouter un magasin à {city}</summary>
                  <AddStoreForm city={city} />
                </details>
              </div>
            </details>
          );
        })}

        <details className="add-store add-city">
          <summary>Ajouter une ville</summary>
          <AddStoreForm />
        </details>
      </section>

      <p className="help">
        Chaque magasin a son propre lien, son QR code, son stock de bons et son créneau. Avec un créneau, la chance
        reste à son niveau de base jusqu’à l’heure de montée, puis grimpe jusqu’à 100 % à la fermeture : le bon du
        jour part avant la fin, le plus souvent dans la dernière partie du créneau. Une fois le nombre de gagnants du
        jour atteint, le magasin se ferme jusqu’au lendemain.
      </p>

      <details className="panel-details" open={settingsOpen}>
        <summary>
          <h2>Réglages généraux</h2>
          <span className="city-sub">Dates, âge minimum, liens de fin de partie, WhatsApp</span>
          <span className="chevron" aria-hidden="true" />
        </summary>
        <div className="panel-body">
          <SettingsForm settings={settings} />
          <p className="help">
            Dates vides : le jeu est ouvert sans limite. Les liens apparaissent sur les écrans de fin de partie ; un
            champ vide masque le bouton. Avec un numéro WhatsApp, le gagnant peut vous envoyer son code en un geste.
          </p>
        </div>
      </details>

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
          <p>
            Le stockage des sauvegardes n’est pas encore relié. En attendant, utilisez « Exporter pour Excel » dans
            Participants.
          </p>
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
