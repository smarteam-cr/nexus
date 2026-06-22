"use client";

/**
 * components/canvas/PublishBar.tsx
 *
 * Barra ÚNICA de guardar/subir — el MISMO diseño y comportamiento en TODOS los
 * canvas (kickoff, cronograma). Una sola fuente para que el flujo "trabajar →
 * guardar avances → subir al cliente" se vea idéntico en todos lados.
 *
 * Modelo (staging real): el cliente ve la ÚLTIMA versión subida. Tres estados,
 * por prioridad:
 *   1. unsaved      → hay ediciones locales sin guardar → botón "Guardar" (azul).
 *   2. unpublished  → hay cambios guardados sin subir   → botón "Subir al cliente" (ámbar).
 *   3. (al día)     → todo guardado y subido            → sin botón (verde).
 *
 * El kickoff auto-guarda → nunca pasa por "unsaved" (solo subir/al-día). El
 * cronograma sí tiene guardado explícito (con razón) → usa los tres estados.
 *
 * Presentacional puro: el caller decide los flags y los handlers. Estilos inline
 * (no Tailwind) para verse IGUAL en el landing claro del kickoff y el panel
 * oscuro del cronograma, sin depender del tema de cada superficie.
 */

interface PublishBarProps {
  /** Hay ediciones locales sin guardar (borrador en memoria). Tiene prioridad sobre unpublished. */
  unsaved?: boolean;
  onSave?: () => void;
  saving?: boolean;
  saveLabel?: string;
  /** Hay cambios guardados sin subir al cliente. */
  unpublished?: boolean;
  onPublish?: () => void;
  publishing?: boolean;
  publishLabel?: string;
  unsavedMessage?: string;
  unpublishedMessage?: string;
  cleanMessage?: string;
  /** No renderizar nada cuando todo está al día (en vez del estado verde). */
  hideWhenClean?: boolean;
  /** Pegar arriba del contenedor con scroll (útil en páginas largas, p.ej. el kickoff). */
  sticky?: boolean;
}

type State = "unsaved" | "unpublished" | "clean";

const THEME: Record<State, { bg: string; border: string; fg: string; chip: string }> = {
  unsaved: { bg: "#eff6ff", border: "#93c5fd", fg: "#1d4ed8", chip: "● Sin guardar" },
  unpublished: { bg: "#fef3c7", border: "#f59e0b", fg: "#92400e", chip: "⚠ Sin subir" },
  clean: { bg: "#ecfdf5", border: "#6ee7b7", fg: "#047857", chip: "✓ Al día" },
};

// Botón sólido por estado (azul para guardar, ámbar para subir).
const BTN: Record<"unsaved" | "unpublished", { bg: string; border: string }> = {
  unsaved: { bg: "#2563eb", border: "#1d4ed8" },
  unpublished: { bg: "#d97706", border: "#b45309" },
};

export default function PublishBar({
  unsaved = false,
  onSave,
  saving = false,
  saveLabel = "Guardar",
  unpublished = false,
  onPublish,
  publishing = false,
  publishLabel = "Subir al cliente",
  unsavedMessage = "Tenés cambios sin guardar.",
  unpublishedMessage = "Cambios sin subir — el cliente todavía no los ve.",
  cleanMessage = "Al día — el cliente ve la última versión.",
  hideWhenClean = false,
  sticky = false,
}: PublishBarProps) {
  const state: State = unsaved ? "unsaved" : unpublished ? "unpublished" : "clean";
  if (state === "clean" && hideWhenClean) return null;

  const t = THEME[state];
  const busy = state === "unsaved" ? saving : publishing;
  const onClick = state === "unsaved" ? onSave : onPublish;
  const label =
    state === "unsaved"
      ? saving
        ? "Guardando…"
        : saveLabel
      : publishing
        ? "Subiendo…"
        : publishLabel;
  const message =
    state === "unsaved" ? unsavedMessage : state === "unpublished" ? unpublishedMessage : cleanMessage;

  return (
    <div
      style={{
        ...(sticky ? { position: "sticky", top: 0 } : {}),
        zIndex: 30,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 16px",
        borderRadius: 14,
        fontSize: 13,
        background: t.bg,
        border: `1px solid ${t.border}`,
        color: t.fg,
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
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
        {t.chip}
      </span>
      <span style={{ flex: 1 }}>{message}</span>
      {state !== "clean" && (
        <button
          onClick={onClick}
          disabled={busy}
          style={{
            flexShrink: 0,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontWeight: 700,
            fontSize: 12,
            color: "#fff",
            background: BTN[state].bg,
            border: `1px solid ${BTN[state].border}`,
            borderRadius: 8,
            padding: "6px 14px",
            cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.7 : 1,
          }}
        >
          {busy && (
            <span
              style={{
                width: 12,
                height: 12,
                border: "2px solid rgba(255,255,255,0.4)",
                borderTopColor: "#fff",
                borderRadius: "50%",
                display: "inline-block",
                animation: "spin 0.7s linear infinite",
              }}
            />
          )}
          {label}
        </button>
      )}
    </div>
  );
}
