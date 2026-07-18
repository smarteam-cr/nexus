"use client";

/**
 * components/canvas/ProjectActionsPanel.tsx
 *
 * "Qué hacer acá" — el ARRIBA del canvas de cronograma. Antes la pantalla era una lista larga sin
 * jerarquía: el CSE tenía que reconstruir el estado del proyecto en su cabeza cada vez que entraba.
 *
 * Agrupa por ACCIÓN (decidir / publicar / atender), no por tipo de objeto. Cada fila dice qué pasa,
 * por qué importa y trae UN botón. Nada se ejecuta solo: Nexus propone, el CSE decide.
 *
 * Cuando no hay nada pendiente NO desaparece: se achica a una línea "todo al día". Que la ausencia
 * de alarmas también comunique — la vista anterior solo hablaba cuando algo estaba mal.
 *
 * Sigue el lenguaje visual de los banners de agente (tokens semánticos, tile 8x8, acciones a la
 * derecha), para que se lea como parte del mismo sistema.
 */
import { groupActions, type ProjectAction, type ActionTone } from "@/lib/timeline/project-actions";

/** Color por tono. `risk` = algo se está deteriorando; `warn` = requiere criterio; `info` = trámite. */
const TONE: Record<ActionTone, { dot: string; cta: string }> = {
  risk: { dot: "bg-red-400", cta: "text-red-300 hover:text-red-200 hover:bg-red-900/20" },
  warn: { dot: "bg-amber-400", cta: "text-amber-300 hover:text-amber-200 hover:bg-amber-900/20" },
  info: { dot: "bg-brand", cta: "text-brand hover:text-brand-dark hover:bg-brand/10" },
};

export default function ProjectActionsPanel({
  actions,
  onAction,
}: {
  actions: ProjectAction[];
  /** El padre mapea el id a su comportamiento (abrir modal, hacer scroll a un bloque, etc.). */
  onAction: (id: string) => void;
}) {
  const grupos = groupActions(actions);

  // Todo al día: una línea, no un bloque vacío ni la ausencia de nada.
  if (grupos.length === 0) {
    return (
      <div className="rounded-2xl border border-line bg-surface-muted px-5 py-3 flex items-center gap-2.5">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
        <p className="text-sm text-fg-secondary">
          <span className="font-semibold text-fg">Todo al día.</span> No hay nada esperando tu decisión.
        </p>
      </div>
    );
  }

  const total = actions.length;

  return (
    <div className="rounded-2xl border border-line bg-surface-muted px-5 py-4 space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-brand/15 border border-brand/30 flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
          </svg>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-fg">Qué hacer acá</p>
          <p className="text-xs text-fg-muted mt-0.5">
            {total === 1 ? "1 cosa pendiente" : `${total} cosas pendientes`} · lo demás está al día
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {grupos.map((g) => (
          <div key={g.group}>
            <p className="text-2xs font-bold uppercase tracking-wider text-fg-muted mb-1.5">
              {g.label}
              <span className="ml-1.5 font-semibold text-fg-muted/70">{g.items.length}</span>
            </p>
            <ul className="space-y-1">
              {g.items.map((a) => (
                <li
                  key={a.id}
                  className="flex items-start gap-2.5 rounded-xl border border-line bg-surface px-3 py-2.5"
                >
                  <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${TONE[a.tone].dot}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-fg font-medium leading-snug">{a.title}</p>
                    <p className="text-[12.5px] text-fg-secondary leading-relaxed mt-0.5">{a.why}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onAction(a.id)}
                    className={`text-xs font-semibold rounded-lg px-2.5 py-1 flex-shrink-0 transition-colors ${TONE[a.tone].cta}`}
                  >
                    {a.cta} →
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
