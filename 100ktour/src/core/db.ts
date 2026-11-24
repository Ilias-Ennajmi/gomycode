import 'server-only';

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variable d'environnement manquante : ${name}`);
  return v;
}

/** Appelle une fonction du schéma ps100k via l'unique porte d'entrée SQL. */
export async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const anon = env('SUPABASE_ANON_KEY');
  const res = await fetch(`${env('SUPABASE_URL')}/rest/v1/rpc/ps100k_api`, {
    method: 'POST',
    headers: {
      apikey: anon,
      Authorization: `Bearer ${anon}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_key: env('PS100K_APP_KEY'), p_fn: fn, p_args: args }),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Base de données : ${fn} a répondu ${res.status}`);
  }
  return (await res.json()) as T;
}
