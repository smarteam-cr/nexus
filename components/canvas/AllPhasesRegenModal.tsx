"use client";

/**
 * components/canvas/AllPhasesRegenModal.tsx
 *
 * "Regenerar todo el cronograma" (Tanda N): acordeón de PhaseRegenPanel, una sección por fase.
 * Reusa la MISMA curación de dos columnas y la MISMA protección (isKept) que el regen por fase
 * — no es un mecanismo nuevo, es el existente aplicado N veces con un solo "Aplicar todo".
 *
 * ⚠ Los paneles se MONTAN SIEMPRE, todas las fases desde el inicio — el colapso es solo visual
 * (`hidden`, no unmount). Si una fase colapsada no estuviera montada, su `useEffect` interno
 * nunca correría y `finalsByPhase` quedaría sin entrada para ella → "Aplicar todo" mandaría
 * `tasks: []` para esa fase y la vaciaría. Montar siempre es lo que hace seguro el default
 * "colapsada = no la toqué, no la vació".
 */
import { useMemo, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { PhaseRegenPanel, phaseHasChanges, type RegenCurrentTask, type RegenProposedTask, type FinalTask } from "./PhaseRegenPanel";
import { indexarTareasPorTitulo, avisoDeRepetida } from "@/lib/timeline/tarea-repetida";

export interface AllPhasesRegenPhase {
  phaseId: string;
  phaseName: string;
  durationWeeks: number;
  current: RegenCurrentTask[];
  proposed: RegenProposedTask[];
}

export interface AllPhasesRegenModalProps {
  open: boolean;
  phases: AllPhasesRegenPhase[];
  applying: boolean;
  onCancel: () => void;
  onApply: (payload: Array<{ phaseId: string; tasks: FinalTask[] }>) => void;
}

export function AllPhasesRegenModal({ open, phases, applying, onCancel, onApply }: AllPhasesRegenModalProps) {
  const [openIds, setOpenIds] = useState<Set<string>>(
    () => new Set(phases.filter((p) => phaseHasChanges(p.proposed.length)).map((p) => p.phaseId)),
  );
  const finalsByPhase = useRef<Record<string, FinalTask[]>>({});
  const totalConCambios = useMemo(
    () => phases.filter((p) => phaseHasChanges(p.proposed.length)).length,
    [phases],
  );
  /* El índice de "qué tareas YA existen y dónde". Este componente es el ÚNICO punto del
     sistema donde la vista cross-fase ya está materializada (recibe todas las fases con sus
     tareas reales), así que el aviso se resuelve acá sin pedirle nada más al servidor. */
  const indice = useMemo(() => indexarTareasPorTitulo(phases), [phases]);

  const toggle = (phaseId: string) =>
    setOpenIds((s) => {
      const next = new Set(s);
      if (next.has(phaseId)) next.delete(phaseId);
      else next.add(phaseId);
      return next;
    });

  return (
    <Modal open={open} onClose={() => { if (!applying) onCancel(); }} size="xxl" closeOnBackdrop={!applying} closeOnEscape={!applying}>
      <div className="min-w-0">
        <p className="text-sm font-medium text-fg">Regenerar todo el cronograma</p>
        <p className="text-xs text-fg-muted mt-1">
          {totalConCambios} de {phases.length} fases tienen cambios propuestos. Revisá fase por fase — arrastrá,
          editá o marcá hechas antes de aplicar; lo que no toques queda como está.
        </p>
        {/* La frontera que confundía: este agente arma la LISTA de tareas, no dice qué ya se
            hizo. El status lo escribe el humano (invariante D.1/D.2) o lo propone el agente de
            avance — sin este aviso, el CSE espera ver marcado lo que sus instrucciones dan por
            terminado y no entiende por qué sale todo pendiente. */}
        <p className="text-xs text-fg-muted mt-2 leading-relaxed">
          Esto define <strong className="text-fg-secondary font-medium">qué tareas</strong> debería tener el plan —
          no marca nada como hecho. Para eso está <strong className="text-fg-secondary font-medium">Re-chequear
          avance</strong>, que propone qué ya se completó y vos confirmás.
        </p>
      </div>

      <div className="mt-4 space-y-2 max-h-[65vh] overflow-y-auto">
        {phases.map((p) => {
          const hasChanges = phaseHasChanges(p.proposed.length);
          const isOpen = openIds.has(p.phaseId);
          return (
            <div key={p.phaseId} className="rounded-lg border border-line">
              <button
                type="button"
                onClick={() => toggle(p.phaseId)}
                className="w-full flex items-center justify-between px-3 py-2 text-left"
              >
                <span className="text-xs font-semibold text-fg">{p.phaseName}</span>
                <span
                  className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                    hasChanges ? "bg-brand/15 text-brand-light" : "text-fg-muted"
                  }`}
                >
                  {hasChanges ? `${p.proposed.length} nuevas` : "queda como está"}
                </span>
              </button>
              {/* Montado SIEMPRE — el colapso es display:none, no unmount (ver docblock arriba). */}
              <div className={`px-2 pb-2 ${isOpen ? "" : "hidden"}`}>
                <PhaseRegenPanel
                  durationWeeks={p.durationWeeks}
                  current={p.current}
                  proposed={p.proposed}
                  avisoRepetida={(titulo) => avisoDeRepetida(titulo, p.phaseId, indice)}
                  onChange={(finals) => { finalsByPhase.current[p.phaseId] = finals; }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex gap-2 mt-5">
        <Button
          variant="primary"
          size="md"
          className="flex-1"
          loading={applying}
          onClick={() => onApply(phases.map((p) => ({ phaseId: p.phaseId, tasks: finalsByPhase.current[p.phaseId] ?? [] })))}
        >
          Aplicar todo el cronograma
        </Button>
        <Button variant="secondary" size="md" className="flex-1" disabled={applying} onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </Modal>
  );
}
