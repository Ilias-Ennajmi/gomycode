import { rpc } from '@/core/db';
import { displayPhone } from '@/core/phone';
import type { AdminOverview, AdminParticipant } from '@/core/types';
import { deleteParticipant, setRedeemed } from '../../actions';
import { ConfirmSubmit } from '../../_ui/Buttons';

const PAGE = 50;

const FILTERS = [
  { v: 'all', label: 'Tous les participants' },
  { v: 'winners', label: 'Gagnants' },
  { v: 'to_redeem', label: 'Bons à remettre' },
  { v: 'redeemed', label: 'Bons remis' },
  { v: 'not_played', label: 'Inscrits sans partie' },
];

const FLASH: Record<string, string> = {
  redeemed: 'Le bon a été mis à jour.',
  deleted: 'La participation a été supprimée.',
};

const when = (local: string) => {
  if (!local) return '';
  const [d, t] = local.split('T');
  const [, m, day] = d.split('-');
  return `${day}/${m} à ${t}`;
};

type Search = { store?: string; filter?: string; q?: string; page?: string; ok?: string };

export default async function Participants({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const store = /^[0-9a-f-]{36}$/.test(sp.store ?? '') ? sp.store! : '';
  const filter = FILTERS.some((f) => f.v === sp.filter) ? sp.filter! : 'all';
  const q = (sp.q ?? '').slice(0, 80);
  const page = Math.max(1, Number(sp.page) || 1);

  const [{ stores }, { rows, total }] = await Promise.all([
    rpc<AdminOverview>('admin_overview'),
    rpc<{ rows: AdminParticipant[]; total: number }>('admin_participants', {
      store_id: store,
      filter,
      q,
      limit: PAGE,
      offset: (page - 1) * PAGE,
    }),
  ]);

  const query = new URLSearchParams();
  if (store) query.set('store', store);
  if (filter !== 'all') query.set('filter', filter);
  if (q) query.set('q', q);
  const here = new URLSearchParams(query);
  if (page > 1) here.set('page', String(page));
  const pageLink = (n: number) => {
    const u = new URLSearchParams(query);
    if (n > 1) u.set('page', String(n));
    return `/admin/participants?${u.toString()}`;
  };
  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <>
      <div className="bo-head">
        <h1>Participants</h1>
        <a className="b b-dark" href={`/admin/export?${query.toString()}`}>
          Exporter pour Excel
        </a>
      </div>

      {sp.ok && FLASH[sp.ok] && (
        <p className="flash" role="status">
          {FLASH[sp.ok]}
        </p>
      )}

      <form className="panel" method="get">
        <div className="grid2">
          <label className="f">
            Magasin
            <select name="store" defaultValue={store}>
              <option value="">Tous les magasins</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.city}
                  {s.store_name ? `, ${s.store_name}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="f">
            Afficher
            <select name="filter" defaultValue={filter}>
              {FILTERS.map((f) => (
                <option key={f.v} value={f.v}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <label className="f">
            Rechercher
            <input name="q" defaultValue={q} placeholder="Nom, téléphone, email ou code" />
          </label>
        </div>
        <div>
          <button className="b">Filtrer</button>
        </div>
      </form>

      <p>
        {total} résultat{total > 1 ? 's' : ''}
      </p>

      <div className="tablewrap">
        {rows.length === 0 ? (
          <p className="empty">Aucune participation ne correspond à ces critères.</p>
        ) : (
          <table className="t">
            <thead>
              <tr>
                <th>Participant</th>
                <th>Téléphone</th>
                <th>Magasin</th>
                <th>Inscription</th>
                <th>Résultat</th>
                <th>Bon</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td className="wrap">
                    <strong>{p.full_name}</strong>, {p.age} ans
                    {p.email && <div className="muted">{p.email}</div>}
                    {p.marketing_opt_in && <div className="muted">Accepte de recevoir les offres</div>}
                    {p.same_device > 1 && (
                      <div>
                        <span className="badge" data-tone="warn">
                          {p.same_device} inscriptions depuis un appareil semblable
                        </span>
                      </div>
                    )}
                  </td>
                  <td>{displayPhone(p.phone)}</td>
                  <td>
                    {p.city}
                    {p.store_name && <div className="muted">{p.store_name}</div>}
                  </td>
                  <td>{when(p.created_at)}</td>
                  <td>
                    {!p.played_at ? (
                      <span className="badge">Pas encore joué</span>
                    ) : p.won ? (
                      <>
                        <code>{p.win_code}</code>
                        <div className="muted">{when(p.played_at)}</div>
                      </>
                    ) : (
                      <span className="muted">Perdu, {when(p.played_at)}</span>
                    )}
                  </td>
                  <td>
                    {p.won &&
                      (p.redeemed_at ? (
                        <>
                          <span className="badge" data-tone="ok">
                            Remis
                          </span>
                          <div className="muted">
                            {when(p.redeemed_at)}, {p.redeemed_by}
                          </div>
                        </>
                      ) : (
                        <span className="badge" data-tone="warn">
                          À remettre
                        </span>
                      ))}
                  </td>
                  <td>
                    <div className="row">
                      {p.won && (
                        <form action={setRedeemed}>
                          <input type="hidden" name="id" value={p.id} />
                          <input type="hidden" name="back" value={here.toString()} />
                          <input type="hidden" name="redeemed" value={String(!p.redeemed_at)} />
                          <button className="b b-quiet">{p.redeemed_at ? 'Annuler la remise' : 'Marquer remis'}</button>
                        </form>
                      )}
                      <form action={deleteParticipant}>
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="back" value={here.toString()} />
                        <ConfirmSubmit
                          question={
                            p.won
                              ? `Supprimer la participation de ${p.full_name} ? Son bon sera remis en jeu et cette personne pourra rejouer.`
                              : `Supprimer la participation de ${p.full_name} ? Cette personne pourra rejouer.`
                          }
                        >
                          Supprimer
                        </ConfirmSubmit>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {pages > 1 && (
        <div className="row">
          {page > 1 && (
            <a className="b b-quiet" href={pageLink(page - 1)}>
              Page précédente
            </a>
          )}
          <span>
            Page {page} sur {pages}
          </span>
          {page < pages && (
            <a className="b b-quiet" href={pageLink(page + 1)}>
              Page suivante
            </a>
          )}
        </div>
      )}
    </>
  );
}
