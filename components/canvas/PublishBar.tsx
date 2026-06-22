"use client";

/**
 * components/canvas/PublishBar.tsx
 *
 * Barra ESTÁNDAR de "guardar/subir" — única fuente del CTA de publicación de los
 * canvas externos (kickoff + cronograma). Reemplaza los banners ad-hoc para que
 * el botón "Subir al cliente" se vea IGUAL en todas las superficies (pedido
 * explícito: "estandar como la barra que aparece en la kickoff").
 *
 * Modelo (staging real): el cliente ve la ÚLTIMA versión subida. Editar guarda un
 * borrador (auto-save continuo, el trabajo no se pierde); el cliente solo ve los
 * cambios al tocar "Subir al cliente".
 *
 *   - state="dirty"  → cambios sin subir (ámbar + botón "Subir").
 *   - state="clean"  → todo subido (verde, sin botón).
 *
 * El CTA (chip + mensaje + botón + colores) es idéntico entre variantes; sólo
 * cambia el contenedor para encajar en cada superficie:
 *   - variant="bar"  → franja full-bleed sticky con borde inferior, como las
 *     demás barras del landing del kickoff (error, revisión del agente).
 *   - variant="card" → tarjeta redondeada en el flujo, para el panel interno
 *     oscuro del cronograma (donde todo lo demás son cards redondeadas).
 *
 * Estilos inline (no Tailwind) para verse idéntica en el landing claro del
 * kickoff y el panel oscuro del cronograma, sin depender del tema de cada uno.
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
  variant?: "bar" | "card";
}

const PALETTE = {
  dirty: { bg: "#fef3c7", border: "#f59e0b", fg: "#92400e" },
  clean: { bg: "#ecfdf5", border: "#6ee7b7", fg: "#047857" },
} as const;

export default function PublishBar({
  state,
  publishing = false,
  onPublish,
  dirtyMessage = "Tenés cambios sin subir — el cliente todavía no los ve.",
  cleanMessage = "Todo subido — el cliente ve la última versión.",
  publishLabel = "Subir cambios al cliente",
  variant = "card",
}: PublishBarProps) {
  const c = PALETTE[state];

  const container: React.CSSProperties =
    variant === "bar"
      ? {
          position: "sticky",
          top: 0,
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 16px",
          fontSize: 13,
          background: c.bg,
          borderBottom: `1px solid ${c.border}`,
          color: c.fg,
          boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
        }
      : {
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 16px",
          fontSize: 13,
          borderRadius: 16,
          background: c.bg,
          border: `1px solid ${c.border}`,
          color: c.fg,
          boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
        };

  const container_z: React.CSSProperties = variant === "bar" ? { zIndex: 48 } : {};

  return (
    <div style={{ ...container, ...container_z }}>
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
        {state === "dirty" ? "⚠ Cambios" : "✓ Al día"}
      </span>
      <span style={{ flex: 1 }}>{state === "dirty" ? dirtyMessage : cleanMessage}</span>
      {state === "dirty" && (
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
            color: c.fg,
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
      )}
    </div>
  );
}
