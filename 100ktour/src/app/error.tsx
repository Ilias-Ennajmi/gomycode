'use client';

export default function ErrorScreen({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="stage">
      <header className="stage-top">
        <img className="stage-logo" src="/brand/planet-sport-black.png" alt="Planet Sport" width={785} height={118} />
      </header>
      <div className="stage-body">
        <h1 className="display">Un instant</h1>
        <p className="lede">
          Le jeu ne répond pas pour le moment. Vérifiez votre connexion, puis réessayez dans quelques secondes.
        </p>
        <button className="btn" onClick={() => reset()}>
          Réessayer
        </button>
      </div>
    </main>
  );
}
