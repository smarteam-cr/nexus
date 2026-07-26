"use client";

/**
 * components/canvas/ProposalGlobalStrip.tsx
 *
 * Lo GLOBAL de una propuesta de estructura: la fecha de arranque sugerida, el reordenamiento de
 * fases, y el aceptar/descartar todo.
 *
 * ── POR QUÉ EXISTE, Y POR QUÉ VIVE DENTRO DEL GANTT ──────────────────────────
 * La propuesta del handoff siempre se resolvió POR ÍTEM dentro del Gantt: badge azul en la fila
 * de la fase que cambia, fila fantasma por fase nueva. Pero dos de sus cambios no viven en
 * ninguna fila —la fecha de arranque y el orden de las fases— así que tenían un banner propio
 * arriba de todo. Ese banner terminó siendo un índice de algo que estaba 300 px más abajo,
 * ocupando el mismo lugar que el documento.
 *
 * Ahora esta franja va en el encabezado del Gantt, pegada al selector de fecha —que es
 * literalmente el control sobre el que se aplica la sugerencia de arranque— y arriba de las
 * filas que el reordenamiento afecta. El cambio y su botón, a la misma altura.
 */
import type { ProposalDelta } from "@/lib/timeline/proposal-deltas";
import { plural } from "@/lib/timeline/weeks";

export default function ProposalGlobalStrip({
  deltas,
  working,
  onResolve,
}: {
  /** TODOS los deltas de la propuesta: el contador y el aceptar-todo son sobre el total. */
  deltas: ProposalDelta[];
  working: boolean;
  onResolve: (accept: string[], discard: string[]) => void;
}) {
  // Solo estos dos no tienen fila propia en el Gantt. El resto se resuelve donde vive.
  const globales = deltas.filter((d) => d.kind === "SET_ANCHOR" || d.kind === "REORDER_PHASES");

  return (
    <div className="rounded-xl border border-blue-700/50 bg-blue-900/15 px-3 py-2 space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-blue-300">
          La IA sugiere {plural(deltas.length, "cambio de estructura", "cambios de estructura")}
        </span>
        <span className="text-[11px] text-fg-muted">
          del último handoff · las tareas y sus estados no se tocan
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => onResolve(deltas.map((d) => d.key), [])}
            disabled={working}
            className="text-xs font-semibold bg-primary text-primary-fg hover:bg-primary-hover disabled:opacity-50 px-3 py-1 rounded-lg transition-colors"
          >
            {working ? "Aplicando…" : "Aceptar todo"}
          </button>
          <button
            onClick={() => onResolve([], deltas.map((d) => d.key))}
            disabled={working}
            className="text-xs font-medium text-fg-muted hover:text-fg border border-line hover:border-fg-muted rounded-lg px-2.5 py-1 disabled:opacity-50 transition-colors"
          >
            Descartar todo
          </button>
        </div>
      </div>

      {globales.map((d) => (
        <div key={d.key} className="flex flex-wrap items-center gap-2 text-[11px] text-fg-secondary">
          <span className="min-w-0">
            {d.kind === "SET_ANCHOR" ? (
              <>
                Fecha de arranque sugerida: {d.from ?? "sin fecha"} →{" "}
                <span className="font-semibold">{d.to}</span>
              </>
            ) : (
              <>
                Reordenar las fases: <span className="font-semibold">{d.names.join(" → ")}</span>
              </>
            )}
          </span>
          <button
            onClick={() => onResolve([d.key], [])}
            disabled={working}
            className="text-emerald-400 hover:text-emerald-300 font-bold disabled:opacity-50"
            title="Aceptar esta sugerencia"
          >
            ✓
          </button>
          <button
            onClick={() => onResolve([], [d.key])}
            disabled={working}
            className="text-red-400 hover:text-red-300 font-bold disabled:opacity-50"
            title="Descartar esta sugerencia"
          >
            ✗
          </button>
        </div>
      ))}

      {/* Solo si hay cambios que NO están en esta franja: si todo es global, mandar a mirar abajo
          sería mandar a ningún lado. */}
      {globales.length < deltas.length && (
        <p className="text-[11px] text-fg-muted">
          El resto se revisa en las filas de abajo — badges azules en las fases que cambian y filas
          «Fase propuesta» — y se acepta o descarta una por una. El cronograma sigue editable.
        </p>
      )}
    </div>
  );
}
