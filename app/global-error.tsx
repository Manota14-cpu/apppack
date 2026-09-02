"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[global-error.tsx]", error.message, { digest: error.digest });
  }, [error]);

  return (
    <html lang="es">
      <body style={{ margin: 0, background: "#000", color: "#fff", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>Error crítico</h1>
          <p style={{ maxWidth: 420, color: "#999", lineHeight: 1.6, margin: 0 }}>
            La aplicación no pudo iniciarse. Recargá la página; si el problema sigue, revisá los registros del
            servidor.
          </p>
          <button
            onClick={reset}
            style={{ background: "#fff", color: "#000", border: 0, borderRadius: 12, padding: "12px 28px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
