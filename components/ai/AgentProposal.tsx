"use client";

import { cn } from "@/lib/cn";

// ── AgentProposal ──────────────────────────────────────────────────────────────
//
// EL marco del ciclo generar → revisar → aplicar/descartar. Es la estructura que
// el cronograma ya declaraba como sistema ("misma estructura de header — tile de
// ícono + título + subtítulo + acciones a la derecha — para que se lean como un
// sistema", CronogramaCanvas) pero que estaba reinventada 6 veces en la app con
// 3 paletas distintas. Un proceso operado con IA nuevo usa ESTO desde el día uno:
// el costo marginal de su banner de propuesta es cero.
//
// Es PRESENTACIONAL PURO: los handlers y el estado los pone cada superficie
// (mismo criterio que PublishBar). El detalle interactivo por ítem (checkboxes de
// fases/tareas, selección de particularidades) va en `children`.
//
// CUÁNDO NO USARLO (paradigmas legítimos distintos — no forzarlos acá):
//   - Bloques DRAFT/CONFIRMED del canvas → useCanvasSections + BlockRenderer
//     (el ciclo vive por-bloque, no por-banner).
//   - Tableros de estado tipo marketing (ContentIdea selected/used/discarded):
//     son flujos de curaduría, no una propuesta puntual.
//   - Borradores editables tipo cobranza (generar → editar → copiar): es un
//     Modal con formulario; si aparece un segundo caso se extrae AgentDraftModal.
//
// `tone` mapea a los acentos ya establecidos: brand (propuesta general),
// progress (avance detectado, esmeralda), deviation (particularidades, ámbar).

const TONE = {
  brand: {
    tile: "bg-brand/15 border-brand/30",
    icon: "text-brand-light",
    path: "M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z",
  },
  progress: {
    tile: "bg-emerald-900/30 border-emerald-700/40",
    icon: "text-emerald-300",
    path: "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6",
  },
  deviation: {
    tile: "bg-amber-900/30 border-amber-700/40",
    icon: "text-amber-300",
    path: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z",
  },
} as const;

export interface AgentProposalProps {
  /** "Avance detectado" / "Propuesta de la IA". */
  title: string;
  /** "Revisa lo que propone el agente y confirma antes de aplicar". */
  subtitle?: string;
  tone?: keyof typeof TONE;
  /** Chips del diff: ["+2 tareas nuevas", "fecha de arranque modificada"]. */
  summary?: string[];
  /** Explicación del agente (por qué propone esto). */
  reasoning?: string;
  /** Avisos ⚠ (assistWarnings). */
  warnings?: string[];
  applyLabel?: string;
  discardLabel?: string;
  onApply: () => void | Promise<void>;
  onDiscard: () => void | Promise<void>;
  /** Deshabilita ambas acciones y muestra "Aplicando…". */
  applying?: boolean;
  /** Aplicar deshabilitado (ej. selección vacía) sin bloquear Descartar. */
  applyDisabled?: boolean;
  /** Ancla de scroll (ej. "cronograma-borradores"). */
  id?: string;
  /** Detalle interactivo por ítem (selecciones, listas con checkbox). */
  children?: React.ReactNode;
  className?: string;
}

export function AgentProposal({
  title,
  subtitle,
  tone = "brand",
  summary,
  reasoning,
  warnings,
  applyLabel = "Aplicar",
  discardLabel = "Descartar",
  onApply,
  onDiscard,
  applying,
  applyDisabled,
  id,
  children,
  className,
}: AgentProposalProps) {
  const t = TONE[tone];
  return (
    <div
      id={id}
      className={cn(
        "rounded-2xl border border-line bg-surface-muted px-5 py-4 space-y-4 scroll-mt-24",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn("w-8 h-8 rounded-lg border flex items-center justify-center flex-shrink-0", t.tile)}>
          <svg className={cn("w-4 h-4", t.icon)} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={t.path} />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-fg">{title}</p>
          {subtitle && <p className="text-xs text-fg-muted mt-0.5">{subtitle}</p>}
          {summary && summary.length > 0 && (
            <p className="text-[11px] text-fg-muted mt-1">{summary.join(" · ")}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => void onApply()}
            disabled={applying || applyDisabled}
            className="text-xs font-semibold text-primary-fg bg-brand hover:bg-brand-dark disabled:opacity-50 px-3.5 py-1.5 rounded-lg transition-colors"
          >
            {applying ? "Aplicando…" : applyLabel}
          </button>
          <button
            type="button"
            onClick={() => void onDiscard()}
            disabled={applying}
            className="text-xs font-medium text-fg-muted hover:text-fg border border-line hover:border-fg-muted rounded-lg px-3 py-1.5 disabled:opacity-50 transition-colors"
          >
            {discardLabel}
          </button>
        </div>
      </div>

      {reasoning && (
        <p className="text-xs text-fg-secondary border-l-2 border-line pl-3">{reasoning}</p>
      )}

      {warnings && warnings.length > 0 && (
        <ul className="text-[11px] text-amber-300 space-y-0.5">
          {warnings.map((w, i) => (
            <li key={i}>⚠ {w}</li>
          ))}
        </ul>
      )}

      {children}
    </div>
  );
}
