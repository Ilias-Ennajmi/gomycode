/**
 * The key idea arriving word by word when processing finishes while it's on screen.
 * Pure CSS on the motion tokens (word-in: --dur-screen, staggered by a share of
 * --dur-fast), so reduce motion (system or in-app) shows it at once.
 */
export function WordReveal({ text, animate }: { text: string; animate: boolean }) {
  if (!animate) return <>{text}</>;
  return (
    <>
      {text.split(/\s+/).map((w, i) => (
        <span key={`${i}-${w}`} className="word-in" style={{ animationDelay: `calc(var(--dur-fast) * ${(i * 0.4).toFixed(2)})` }}>
          {w}{" "}
        </span>
      ))}
    </>
  );
}
