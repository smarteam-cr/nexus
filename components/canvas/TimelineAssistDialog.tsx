"use client";

/**
 * TimelineAssistDialog
 *
 * Modal para pedirle un cambio al cronograma a la IA. Reemplaza la barra inline:
 * permite elegir el ALCANCE (todo el cronograma o una fase puntual — preseleccionado
 * cuando se abre desde el botón "Editar con IA" de una fase), escribir la instrucción
 * y arrancar con chips de ejemplos. Devuelve (instruction, scopePhaseId) al padre,
 * que corre el assist y muestra la propuesta en el Gantt (preview + Aplicar/Descartar).
 */
import { useState, useEffect } from "react";

const EXAMPLE_CHIPS = [
  "Atrasar una semana",
  "Agregar tareas de migración de datos",
  "Sumar una semana de tareas",
  "Acortar esta fase",
  "Más detalle de adopción",
];

export default function TimelineAssistDialog({
  open,
  onClose,
  phases,
  initialScopePhaseId,
  onSubmit,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  phases: { id?: string; name: string }[];
  initialScopePhaseId: string | null;
  onSubmit: (instruction: string, scopePhaseId: string | null) => void;
  loading: boolean;
}) {
  const [scope, setScope] = useState<string | null>(initialScopePhaseId);
  const [instruction, setInstruction] = useState("");

  // Re-sembrar el alcance al abrir (puede venir de una fase distinta cada vez).
  useEffect(() => {
    if (open) setScope(initialScopePhaseId);
  }, [open, initialScopePhaseId]);

  if (!open) return null;

  const scopedPhase = scope ? phases.find((p) => p.id === scope) : null;
  const canSubmit = instruction.trim().length >= 4 && !loading;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-surface border border-line shadow-2xl p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-3">
          <span className="inline-flex w-9 h-9 rounded-lg bg-brand/15 text-brand items-center justify-center flex-shrink-0">
            <svg className="w-4.5 h-4.5" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-fg">Cambiar el cronograma con IA</h2>
            <p className="text-xs text-fg-muted">Describí el cambio; la IA propone y vos revisás antes de aplicar.</p>
          </div>
        </div>

        {/* Alcance */}
        <div>
          <label className="block text-[10px] font-semibold text-fg-muted uppercase tracking-wider mb-1.5">Alcance</label>
          <select
            value={scope ?? ""}
            onChange={(e) => setScope(e.target.value || null)}
            className="w-full text-sm bg-surface-muted border border-line rounded-lg px-3 py-2 text-fg focus:outline-none focus:border-brand"
          >
            <option value="">Todo el cronograma</option>
            {phases.filter((p) => p.id).map((p) => (
              <option key={p.id} value={p.id}>Solo la fase: {p.name}</option>
            ))}
          </select>
          {scopedPhase && (
            <p className="text-[11px] text-brand mt-1.5">El cambio se aplicará solo a “{scopedPhase.name}”.</p>
          )}
        </div>

        {/* Instrucción */}
        <div>
          <label className="block text-[10px] font-semibold text-fg-muted uppercase tracking-wider mb-1.5">Qué querés cambiar</label>
          <textarea
            autoFocus
            rows={3}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder={
              scopedPhase
                ? `Ej: "agregá tareas de migración de datos en ${scopedPhase.name}"`
                : 'Ej: "atrasá Setup una semana y agregá una demo intermedia"'
            }
            className="w-full text-sm bg-surface-muted border border-line rounded-lg px-3 py-2 text-fg placeholder-fg-muted focus:outline-none focus:border-brand resize-none"
          />
          <div className="flex flex-wrap gap-1.5 mt-2">
            {EXAMPLE_CHIPS.map((c) => (
              <button
                key={c}
                onClick={() => setInstruction(c)}
                className="text-[11px] px-2.5 py-1 rounded-full bg-surface-muted border border-line text-fg-secondary hover:border-brand hover:text-brand transition-colors"
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            disabled={loading}
            className="text-sm font-medium px-3.5 py-2 rounded-lg border border-line text-fg-secondary hover:bg-surface-hover transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={() => onSubmit(instruction.trim(), scope)}
            disabled={!canSubmit}
            className="flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg bg-brand text-white hover:bg-brand/90 transition-colors disabled:opacity-40"
          >
            {loading ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Generando…
              </>
            ) : (
              "Generar propuesta"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
