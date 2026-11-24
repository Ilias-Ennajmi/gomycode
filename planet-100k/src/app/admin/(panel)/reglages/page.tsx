import { rpc } from '@/core/db';
import type { AdminOverview } from '@/core/types';
import { changePassword, saveSettings } from '../../actions';

const FLASH: Record<string, string> = {
  saved: 'Réglages enregistrés.',
  password: 'Mot de passe modifié.',
};

const ERRORS: Record<string, string> = {
  invalid: "Certaines valeurs ne sont pas valides. Le lien Instagram doit commencer par https://.",
  dates: 'La date de fin doit être après la date de début.',
  mismatch: 'Les deux nouveaux mots de passe ne sont pas identiques.',
  bad_password: 'Le mot de passe actuel est incorrect.',
  too_short: 'Le nouveau mot de passe doit contenir au moins 10 caractères.',
};

export default async function Settings({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { ok, err } = await searchParams;
  const { settings } = await rpc<AdminOverview>('admin_overview');

  return (
    <>
      <h1>Réglages</h1>
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

      <form className="panel" action={saveSettings}>
        <h2>Période et conditions du jeu</h2>
        <div className="grid2">
          <label className="f">
            Début <small>Heure du Maroc. Vide : ouvert dès maintenant.</small>
            <input type="datetime-local" name="starts_at" defaultValue={settings.starts_at} />
          </label>
          <label className="f">
            Fin <small>Heure du Maroc. Vide : pas de date de fin.</small>
            <input type="datetime-local" name="ends_at" defaultValue={settings.ends_at} />
          </label>
          <label className="f">
            Âge minimum <small>Affiché dans le formulaire et le règlement.</small>
            <input type="number" name="min_age" min={0} max={99} defaultValue={settings.min_age} required />
          </label>
          <label className="f">
            Lien Instagram <small>Bouton affiché après la partie. Vide : pas de bouton.</small>
            <input type="url" name="instagram_url" defaultValue={settings.instagram_url} placeholder="https://www.instagram.com/…" />
          </label>
        </div>
        <div>
          <button className="b b-dark">Enregistrer les réglages</button>
        </div>
      </form>

      <form className="panel" action={changePassword}>
        <h2>Mot de passe du back-office</h2>
        <div className="grid2">
          <label className="f">
            Mot de passe actuel
            <input type="password" name="current" autoComplete="current-password" required />
          </label>
          <label className="f">
            Nouveau mot de passe <small>10 caractères au minimum.</small>
            <input type="password" name="next" autoComplete="new-password" minLength={10} required />
          </label>
          <label className="f">
            Confirmer le nouveau mot de passe
            <input type="password" name="confirm" autoComplete="new-password" minLength={10} required />
          </label>
        </div>
        <div>
          <button className="b b-dark">Changer le mot de passe</button>
        </div>
      </form>
    </>
  );
}
