import "@/components/viewer/viewer.css";

/** Shown while the server prepares the board: the page's own frame, so nothing jumps when the board arrives. */
export default function Loading() {
  return (
    <div className="vw-root" aria-busy="true">
      <header className="vw-top">
        <div className="vw-titlewrap">
          <div className="vw-skel vw-skel-title" />
        </div>
      </header>
      <main className="vw-main">
        <div className="vw-skel vw-skel-stage" />
      </main>
      <p className="vw-sr" role="status">
        Loading the board
      </p>
    </div>
  );
}
