import { rpc } from '@/core/db';
import type { GameState } from '@/core/types';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Règlement du jeu 100K | Planet Sport' };

export default async function Reglement() {
  // N'importe quel magasin donne accès aux réglages communs (âge minimum).
  const state = await rpc<GameState | { found: false }>('game_state', { slug: 'casablanca', device_id: '' }).catch(
    () => null,
  );
  const minAge = state && state.found ? state.min_age : 18;

  return (
    <main className="doc">
      <img src="/brand/planet-sport-black.png" alt="Planet Sport" width={785} height={118} />
      <h1>Règlement du jeu 100K</h1>
      <p>
        Planet Sport organise ce jeu pour fêter ses 100 000 abonnés sur Instagram. La participation est gratuite
        et sans obligation d&apos;achat.
      </p>

      <h2>Qui peut jouer</h2>
      <ul>
        <li>Toute personne âgée de {minAge} ans ou plus, présente dans un magasin Planet Sport participant.</li>
        <li>Une seule participation par personne, par numéro de téléphone et par appareil.</li>
        <li>Le personnel de Planet Sport ne peut pas participer.</li>
      </ul>

      <h2>Comment jouer</h2>
      <ul>
        <li>Scannez le QR code affiché en magasin et remplissez le formulaire.</li>
        <li>Lancez la machine. Si elle aligne 1, 0, 0, vous gagnez.</li>
        <li>Le résultat est tiré au sort par notre serveur au moment où vous lancez la machine.</li>
      </ul>

      <h2>Les lots</h2>
      <ul>
        <li>Chaque gagnant reçoit un bon d&apos;achat de 1000 DH à dépenser chez Planet Sport.</li>
        <li>Le nombre de bons est limité dans chaque ville. Quand tous les bons d&apos;une ville sont gagnés, le jeu s&apos;y arrête.</li>
        <li>Le bon ne peut pas être échangé contre de l&apos;argent.</li>
      </ul>

      <h2>Recevoir son bon</h2>
      <ul>
        <li>Présentez votre code gagnant en caisse, dans le magasin où vous avez joué.</li>
        <li>Munissez-vous du téléphone utilisé pour jouer et d&apos;une pièce d&apos;identité.</li>
        <li>Le gagnant accepte d&apos;être pris en photo en magasin et que cette photo soit publiée sur les réseaux sociaux de Planet Sport.</li>
      </ul>

      <h2>Vos données</h2>
      <p>
        Votre nom, votre âge, votre numéro de téléphone et votre adresse email, si vous la donnez, servent à gérer
        votre participation, à empêcher les participations multiples et à vous remettre votre lot. Conformément à
        la loi 09-08, vous pouvez demander à consulter, corriger ou supprimer vos données en vous adressant à
        Planet Sport.
      </p>

      <h2>Fraude</h2>
      <p>
        Planet Sport peut annuler une participation en cas de fausse information ou de tentative de contourner
        la limite d&apos;une participation par personne.
      </p>
    </main>
  );
}
