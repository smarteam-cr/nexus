"use client";

/**
 * components/canvas/PhaseRegenModal.tsx
 *
 * Envoltura fina de PhaseRegenPanel (Tanda N — la curación de dos columnas se extrajo ahí para
 * reusarla en el acordeón de AllPhasesRegenModal.tsx, "Regenerar todo el cronograma"). Mismos
 * props/import que antes de la extracción — cero cambio para CronogramaCanvas.tsx.
 */
import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { PhaseRegenPanel, type RegenCurrentTask, type RegenProposedTask, type FinalTask } from "./PhaseRegenPanel";
import type { AvisoRepetida } from "@/lib/timeline/tarea-repetida";

export type { RegenCurrentTask, RegenProposedTask, FinalTask };

export interface PhaseRegenModalProps {
  open: boolean;
  phaseName: string;
  durationWeeks: number;
  current: RegenCurrentTask[];
  proposed: RegenProposedTask[];
  applying: boolean;
  /** ¿Este título ya existe en otra fase del cronograma? Lo resuelve el caller (es el que ve
   *  todas las fases); acá solo se pasa al panel. */
  avisoRepetida?: (titulo: string) => AvisoRepetida | null;
  onCancel: () => void;
  onApply: (finalTasks: FinalTask[]) => void;
}

export function PhaseRegenModal({ open, phaseName, durationWeeks, current, proposed, applying, avisoRepetida, onCancel, onApply }: PhaseRegenModalProps) {
  const [finals, setFinals] = useState<FinalTask[]>([]);

  return (
    <Modal open={open} onClose={() => { if (!applying) onCancel(); }} size="xxl" closeOnBackdrop={!applying} closeOnEscape={!applying}>
      <div className="min-w-0">
        <p className="text-sm font-medium text-fg">Regenerar «{phaseName}»</p>
        <p className="text-xs text-fg-muted mt-1">
          Arrastrá entre columnas, editá, borrá y marcá hechas para definir cómo queda la fase. La derecha es
          el resultado; lo que quede a la izquierda se descarta.
        </p>
      </div>

      <PhaseRegenPanel durationWeeks={durationWeeks} current={current} proposed={proposed} avisoRepetida={avisoRepetida} onChange={setFinals} />

      <div className="flex gap-2 mt-5">
        <Button variant="primary" size="md" className="flex-1" loading={applying} onClick={() => onApply(finals)}>
          Aceptar ({finals.length})
        </Button>
        <Button variant="secondary" size="md" className="flex-1" disabled={applying} onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </Modal>
  );
}
