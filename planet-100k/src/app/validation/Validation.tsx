'use client';

import { useState } from 'react';
import { displayPhone } from '@/core/phone';
import { checkVoucher, type Voucher } from './actions';

const ERRORS = {
  no_match: 'Ce code et ce code magasin ne correspondent à aucun bon gagnant. Vérifiez les deux et réessayez.',
  rate: "Trop d'essais. Réessayez dans un quart d'heure ou contactez le siège.",
  unknown: 'Un problème est survenu. Vérifiez votre connexion et réessayez.',
};

const when = (local: string) => {
  const [d, t] = local.split('T');
  return `${d.split('-').reverse().join('/')} à ${t}`;
};

export default function Validation() {
  const [pin, setPin] = useState('');
  const [code, setCode] = useState('');
  const [voucher, setVoucher] = useState<Voucher | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [justRedeemed, setJustRedeemed] = useState(false);

  async function run(redeem: boolean) {
    setBusy(true);
    setError('');
    const res = await checkVoucher(pin.trim(), code.trim(), redeem);
    setBusy(false);
    if (res.ok) {
      setVoucher(res.voucher);
      setJustRedeemed(redeem);
    } else {
      setVoucher(null);
      setError(ERRORS[res.error]);
    }
  }

  return (
    <main className="login">
      <div className="login-card">
        <img src="/brand/planet-sport-black.png" alt="Planet Sport" width={785} height={118} />
        <h1>Remise d&apos;un bon</h1>

        {!voucher && (
          <form
            style={{ display: 'grid', gap: 14 }}
            onSubmit={(e) => {
              e.preventDefault();
              run(false);
            }}
          >
            <label className="f">
              Code magasin
              <small>Les 6 chiffres communiqués par le siège.</small>
              <input
                inputMode="numeric"
                autoComplete="off"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                required
              />
            </label>
            <label className="f">
              Code gagnant du client
              <small>Affiché sur son téléphone, par exemple PS-7K4M9Q.</small>
              <input
                autoComplete="off"
                autoCapitalize="characters"
                maxLength={12}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                required
              />
            </label>
            {error && (
              <p className="flash" data-tone="err" role="alert">
                {error}
              </p>
            )}
            <button className="b b-dark" disabled={busy}>
              {busy ? 'Vérification…' : 'Vérifier le code'}
            </button>
          </form>
        )}

        {voucher && (
          <div style={{ display: 'grid', gap: 12 }}>
            <p className="bigcode">{voucher.code}</p>
            <p>
              <strong>{voucher.full_name}</strong>
              <br />
              {displayPhone(voucher.phone)}
              <br />
              Gagné le {when(voucher.played_at)} à {voucher.store_name || voucher.city}
            </p>
            {voucher.redeemed_at ? (
              <p className="flash" data-tone={justRedeemed ? undefined : 'err'} role="status">
                {justRedeemed
                  ? 'Bon marqué comme remis. Vous pouvez donner le bon au client.'
                  : `Attention : ce bon a déjà été remis le ${when(voucher.redeemed_at)}.`}
              </p>
            ) : (
              <>
                <p>
                  Vérifiez la pièce d&apos;identité du client et appelez son numéro : son téléphone doit sonner.
                  Prenez la photo, puis confirmez.
                </p>
                <button className="b b-red" disabled={busy} onClick={() => run(true)}>
                  {busy ? 'Enregistrement…' : 'Marquer le bon comme remis'}
                </button>
              </>
            )}
            <button
              className="b b-quiet"
              onClick={() => {
                setVoucher(null);
                setCode('');
              }}
            >
              Vérifier un autre code
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
