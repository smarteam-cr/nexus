"use client";

/**
 * app/global-error.tsx
 *
 * Red de última instancia: captura errores que ocurren en los layouts raíz (que el
 * error.tsx de un segmento NO cubre). Reemplaza TODO el árbol, así que debe renderizar
 * su propio <html><body> y NO puede confiar en el theme/CSS de la app → estilos inline.
 * El caso común (errores de render del workspace) lo atrapa app/clients/[id]/error.tsx;
 * esto es solo el backstop.
 */
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global error boundary]", error);
  }, [error]);

  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0a",
          color: "#e5e7eb",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: 420, padding: "0 24px" }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Algo salió mal</h2>
          <p style={{ fontSize: 13, color: "#9ca3af", marginTop: 8 }}>
            Ocurrió un error inesperado. Probá recargar la página.
          </p>
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
                fontSize: 13, fontWeight: 500, color: "#9ca3af", background: "transparent",
                border: "1px solid #374151", padding: "8px 14px", borderRadius: 8, cursor: "pointer",
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
