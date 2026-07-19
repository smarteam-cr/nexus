"use client";

/**
 * app/external/error.tsx
 *
 * Error boundary de TODA la superficie externa (kickoff, cronograma, business
 * case, desarrollo, verify) — la que ven CLIENTES REALES. Antes de esto, un
 * throw en el RSC caía al global-error negro sin tema: eso fue lo que vieron
 * los clientes durante la semana del bug de snapshots (julio 2026).
 *
 * Decisión: NO degradar a <NoAccess/> — ese mensaje significa "tu acceso
 * expiró" y ante un bug NUESTRO enmascararía el incidente (el cliente escala
 * con su CSE creyendo que le revocaron el link). Acá el copy es honesto:
 * problema temporal nuestro, reintenta.
 *
 * Estilos INLINE (como NoAccess): este boundary puede renderizar cuando parte
 * del árbol falló — no depende de clases del tema. Registro tuteo neutro,
 * idéntico a NoAccess. Sí reportamos a Sentry: un throw cara-al-cliente es de
 * los incidentes que más queremos ver.
 */
import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function ExternalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "60vh", padding: "48px 16px" }}>
      <div style={{ maxWidth: 380, textAlign: "center" }}>
        <h1
          style={{
            margin: 0,
            fontSize: 20,
            fontWeight: 600,
            color: "#111827",
            fontFamily: "var(--font-montserrat), system-ui, sans-serif",
          }}
        >
          No pudimos cargar esta página
        </h1>
        <p style={{ marginTop: 10, fontSize: 14, lineHeight: 1.6, color: "#6b7280" }}>
          Ocurrió un problema temporal de nuestro lado. Intenta de nuevo en unos
          minutos.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: 20,
            padding: "9px 22px",
            fontSize: 14,
            fontWeight: 600,
            color: "#ffffff",
            background: "#111827",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
            fontFamily: "var(--font-montserrat), system-ui, sans-serif",
          }}
        >
          Reintentar
        </button>
        {error.digest ? (
          <p style={{ marginTop: 16, fontSize: 11, color: "#9ca3af" }}>ref: {error.digest}</p>
        ) : null}
      </div>
    </div>
  );
}
