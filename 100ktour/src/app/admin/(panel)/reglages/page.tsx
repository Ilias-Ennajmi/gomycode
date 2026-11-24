import { changePassword } from '../../actions';

const ERRORS: Record<string, string> = {
  mismatch: 'Les deux nouveaux mots de passe ne sont pas identiques.',
  bad_password: 'Le mot de passe actuel est incorrect.',
  too_short: 'Le nouveau mot de passe doit contenir au moins 10 caractères.',
};

export default async function Password({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { ok, err } = await searchParams;
  return (
    <>
      <h1>Mot de passe</h1>
      {ok === 'password' && (
        <p className="flash" role="status">
          Mot de passe modifié.
        </p>
      )}
      {err && (
        <p className="flash" data-tone="err" role="alert">
          {ERRORS[err] ?? 'Le mot de passe n’a pas pu être modifié.'}
        </p>
      )}
      <form className="panel" action={changePassword}>
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
