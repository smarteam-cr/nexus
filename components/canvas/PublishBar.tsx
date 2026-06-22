"use client";

/**
 * components/canvas/PublishBar.tsx
 *
 * Barra ÚNICA de guardar/subir — el MISMO diseño y comportamiento en TODOS los
 * canvas cara-al-cliente (kickoff, cronograma). Modelo: auto-guardado interno +
 * "Subir al cliente" como ÚNICO paso que publica. Nada llega al cliente hasta Subir.
 *
 * Estados (por prioridad):
 *   1. saving       → "Guardando…" (spinner; el auto-guardado está en curso).
 *   2. hint         → mensaje informativo sin acción (p.ej. "Completá los campos…").
 *   3. unpublished  → "✓ Cambios guardados — el cliente todavía no los ve" + botón
 *                     "Subir al cliente".
 *   4. (al día)     → oculto con hideWhenClean, o un verde sutil.
 *
 * Presentacional puro. Estilos inline (no Tailwind) para verse IGUAL en el landing
 * claro del kickoff y el panel oscuro del cronograma, sin depender del tema.
 */

interface PublishBarProps {
  /** Auto-guardado en curso → "Guardando…". Máxima prioridad. */
  saving?: boolean;
  /** Mensaje informativo sin acción (p.ej. validación pendiente). */
  hint?: string;
  /** Hay cambios guardados sin subir → "Cambios guardados" + "Subir al cliente". */
  unpublished?: boolean;
  onPublish?: () => void;
  publishing?: boolean;
  publishLabel?: string;
  savedMessage?: string;
  savingMessage?: string;
  cleanMessage?: string;
  /** No renderizar nada cuando todo está al día. */
  hideWhenClean?: boolean;
  /** Pegar arriba del contenedor con scroll (páginas largas, p.ej. el kickoff). */
  sticky?: boolean;
}

type View = "saving" | "hint" | "unpublished" | "clean";

const PALETTE: Record<View, { bg: string; border: string; fg: string }> = {
  saving: { bg: "#eff6ff", border: "#93c5fd", fg: "#1d4ed8" },
  hint: { bg: "#fef3c7", border: "#f59e0b", fg: "#92400e" },
  unpublished: { bg: "#fef3c7", border: "#f59e0b", fg: "#92400e" },
  clean: { bg: "#ecfdf5", border: "#6ee7b7", fg: "#047857" },
};

function Spinner({ color }: { color: string }) {
  return (
    <span
      style={{
        width: 12,
        height: 12,
        border: `2px solid ${color}33`,
        borderTopColor: color,
        borderRadius: "50%",
        display: "inline-block",
        animation: "spin 0.7s linear infinite",
      }}
    />
  );
}

const CHIP: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontWeight: 700,
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  flexShrink: 0,
};

export default function PublishBar({
  saving = false,
  hint,
  unpublished = false,
  onPublish,
  publishing = false,
  publishLabel = "Subir al cliente",
  savedMessage = "Cambios guardados — el cliente todavía no los ve.",
  savingMessage = "Guardando…",
  cleanMessage = "El cliente ve la última versión.",
  hideWhenClean = false,
  sticky = false,
}: PublishBarProps) {
  const view: View = saving ? "saving" : hint ? "hint" : unpublished ? "unpublished" : "clean";
  if (view === "clean" && hideWhenClean) return null;

  const p = PALETTE[view];
  const container: React.CSSProperties = {
    ...(sticky ? { position: "sticky", top: 0 } : {}),
    zIndex: 30,
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 16px",
    borderRadius: 14,
    fontSize: 13,
    background: p.bg,
    border: `1px solid ${p.border}`,
    color: p.fg,
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
  };

  if (view === "saving") {
    return (
      <div style={container}>
        <span style={{ ...CHIP, textTransform: "none", letterSpacing: 0, fontWeight: 600, fontSize: 13 }}>
          <Spinner color={p.fg} /> {savingMessage}
        </span>
      </div>
    );
  }

  if (view === "hint") {
    return (
      <div style={container}>
        <span style={CHIP}>⚠</span>
        <span style={{ flex: 1 }}>{hint}</span>
      </div>
    );
  }

  if (view === "clean") {
    return (
      <div style={container}>
        <span style={CHIP}>✓ Al día</span>
        <span style={{ flex: 1 }}>{cleanMessage}</span>
      </div>
    );
  }

  // unpublished
  return (
    <div style={container}>
      <span style={CHIP}>✓ Guardado</span>
      <span style={{ flex: 1 }}>{savedMessage}</span>
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
          color: "#fff",
          background: "#d97706",
          border: "1px solid #b45309",
          borderRadius: 8,
          padding: "6px 14px",
          cursor: publishing ? "default" : "pointer",
          opacity: publishing ? 0.7 : 1,
        }}
      >
        {publishing && <Spinner color="#fff" />}
        {publishing ? "Subiendo…" : publishLabel}
      </button>
    </div>
  );
}
