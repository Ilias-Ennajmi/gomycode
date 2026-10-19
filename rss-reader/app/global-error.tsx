"use client";

/** The root layout itself failing: a plain page, no app styles to rely on. */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          background: "#14161B",
          color: "#e5e7eb",
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: 24,
        }}
      >
        <div>
          <h1 style={{ fontSize: 20, marginBottom: 8 }}>Reader hit a snag</h1>
          <p style={{ opacity: 0.7, marginBottom: 16 }}>Reloading usually fixes it.</p>
          <button
            type="button"
            onClick={reset}
            style={{
              background: "#8b5cf6",
              color: "white",
              border: 0,
              borderRadius: 999,
              padding: "10px 18px",
              fontWeight: 600,
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
