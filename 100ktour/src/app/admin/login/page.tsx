import { redirect } from 'next/navigation';
import { isAdmin } from '@/core/security';
import { login } from '../actions';

export const metadata = { title: 'Back-office | Planet Sport 100K' };

const ERRORS: Record<string, string> = {
  bad: 'Mot de passe incorrect.',
  rate: "Trop d'essais. Réessayez dans un quart d'heure.",
};

export default async function Login({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  if (await isAdmin()) redirect('/admin');
  const { err } = await searchParams;
  return (
    <main className="login">
      <form className="login-card" action={login}>
        <img src="/brand/planet-sport-black.png" alt="Planet Sport" width={785} height={118} />
        <h1>Back-office 100K</h1>
        <label className="f">
          Mot de passe
          <input type="password" name="password" autoComplete="current-password" required autoFocus />
        </label>
        {err && ERRORS[err] && (
          <p className="flash" data-tone="err" role="alert">
            {ERRORS[err]}
          </p>
        )}
        <button className="b b-dark">Se connecter</button>
      </form>
    </main>
  );
}
