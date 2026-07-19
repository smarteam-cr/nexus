"use client";

/**
 * app/global-error.tsx
 *
 * Red de última instancia: captura errores que ocurren en los layouts raíz (que el
 * error.tsx de un segmento NO cubre). Reemplaza TODO el árbol, así que debe renderizar
 * su propio <html><body> y NO puede confiar en el theme/CSS de la app.
 *
 * Por eso TODO es inline y CLARO autosuficiente: cuando esto renderiza, el CSS global
 * puede no estar cargado — `className="light"` va igual (por si sí cargó, pinea los
 * controles nativos) pero los estilos no dependen de él. Centrado con
 * `display:grid; placeItems:center` (robusto: la versión anterior con flex llegó a
 * pintarse con el texto abajo a la derecha cuando el CSS no acompañaba). Antes esto
 * era una pantalla NEGRA sin tema — lo que vieron los clientes en la ola de julio
 * 2026; ahora las secciones internas caen primero en (shell)/error.tsx y el externo
 * en external/error.tsx, así que esto es solo el backstop real.
 */
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error); // no-op sin DSN configurado
    console.error("[global error boundary]", error);
  }, [error]);

  return (
    <html lang="es" className="light" style={{ colorScheme: "light" }}>
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#ffffff",
          color: "#111827",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: 420, padding: "0 24px" }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Algo salió mal</h2>
          <p style={{ fontSize: 13, color: "#6b7280", marginTop: 8 }}>
            Ocurrió un error inesperado. Probá recargar la página.
          </p>
          {error?.digest ? (
            <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 8, fontFamily: "monospace" }}>
              ref: {error.digest}
            </p>
          ) : null}
          <div style={{ marginTop: 20, display: "flex", gap: 8, justifyContent: "center" }}>
            <button
              onClick={() => reset()}
              style={{
                fontSize: 13, fontWeight: 600, color: "#fff", background: "#2563eb",
                border: "none", padding: "8px 14px", borderRadius: 8, cursor: "pointer",
              }}
            >
              Reintentar
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                fontSize: 13, fontWeight: 500, color: "#6b7280", background: "transparent",
                border: "1px solid #d1d5db", padding: "8px 14px", borderRadius: 8, cursor: "pointer",
              }}
            >
              Recargar
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
