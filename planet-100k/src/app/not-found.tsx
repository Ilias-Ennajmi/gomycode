export default function NotFound() {
  return (
    <main className="stage">
      <header className="stage-top">
        <img className="stage-logo" src="/brand/planet-sport-white.png" alt="Planet Sport" width={785} height={118} />
      </header>
      <div className="stage-body">
        <h1 className="display">Page introuvable</h1>
        <p className="lede">
          Ce lien ne correspond à aucun magasin. Scannez à nouveau le QR code affiché dans votre magasin Planet
          Sport.
        </p>
      </div>
    </main>
  );
}
