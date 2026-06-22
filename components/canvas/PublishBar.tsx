"use client";

/**
 * components/canvas/PublishBar.tsx
 *
 * Barra ESTÁNDAR de "guardar/subir" — única fuente visual del flujo de
 * publicación de los canvas externos (kickoff + cronograma). Reemplaza los
 * banners ad-hoc para que el CTA se vea IGUAL en todas las superficies (pedido
 * explícito del usuario: "estandar como la barra que aparece en la kickoff").
 *
 * Modelo (staging real): el cliente ve la ÚLTIMA versión subida. Editar guarda
 * un borrador (auto-save continuo, el trabajo no se pierde); el cliente solo ve
 * los cambios al tocar "Subir al cliente".
 *
 *   - state="dirty"  → hay cambios sin subir (ámbar + botón "Subir").
 *   - state="clean"  → todo subido (verde, slim, sin botón).
 *
 * Presentacional puro: el caller decide CUÁNDO renderizarla y qué hace "Subir".
 * Estilos inline (no Tailwind) para que se vea idéntica en el landing claro del
 * kickoff y en el panel oscuro del cronograma, sin depender del tema de cada uno.
 */

interface PublishBarProps {
  state: "dirty" | "clean";
  /** Spinner + deshabilita el botón mientras sube. */
  publishing?: boolean;
  /** Acción de "Subir al cliente". Requerido en state="dirty". */
  onPublish?: () => void;
  /** Texto del estado sucio (default: "Tenés cambios sin subir — el cliente todavía no los ve."). */
  dirtyMessage?: string;
  /** Texto del estado al día (default: "Todo subido — el cliente ve la última versión."). */
  cleanMessage?: string;
  /** Texto del botón (default: "Subir cambios al cliente"). */
  publishLabel?: string;
  /** Pegar arriba del contenedor con scroll (default true). */
  sticky?: boolean;
}

export default function PublishBar({
  state,
  publishing = false,
  onPublish,
  dirtyMessage = "Tenés cambios sin subir — el cliente todavía no los ve.",
  cleanMessage = "Todo subido — el cliente ve la última versión.",
  publishLabel = "Subir cambios al cliente",
  sticky = true,
}: PublishBarProps) {
  const base: React.CSSProperties = {
    ...(sticky ? { position: "sticky", top: 0 } : {}),
    zIndex: 48,
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 16px",
    fontSize: 13,
    borderRadius: 12,
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
  };

  if (state === "clean") {
    return (
      <div
        style={{
          ...base,
          background: "#ecfdf5",
          border: "1px solid #6ee7b7",
          color: "#047857",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontWeight: 700,
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            flexShrink: 0,
          }}
        >
          ✓ Al día
        </span>
        <span style={{ flex: 1 }}>{cleanMessage}</span>
      </div>
    );
  }

  return (
    <div
      style={{
        ...base,
        background: "#fef3c7",
        border: "1px solid #f59e0b",
        color: "#92400e",
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontWeight: 700,
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          flexShrink: 0,
        }}
      >
        ⚠ Cambios
      </span>
      <span style={{ flex: 1 }}>{dirtyMessage}</span>
      <button
        onClick={onPublish}
        disabled={publishing}
        style={{
          flexShrink: 0,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontWeight: 700,
          fontSize: 12,
          color: "#92400e",
          background: "rgba(217,119,6,0.18)",
          border: "1px solid #d97706",
          borderRadius: 8,
          padding: "6px 14px",
          cursor: publishing ? "default" : "pointer",
          opacity: publishing ? 0.6 : 1,
        }}
      >
        {publishing && (
          <span
            style={{
              width: 12,
              height: 12,
              border: "2px solid rgba(146,64,14,0.3)",
              borderTopColor: "#92400e",
              borderRadius: "50%",
              display: "inline-block",
              animation: "spin 0.7s linear infinite",
            }}
          />
        )}
        {publishing ? "Subiendo…" : publishLabel}
      </button>
    </div>
  );
}
