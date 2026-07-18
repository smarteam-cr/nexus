"use client";

/**
 * components/canvas/ParticularidadToTaskModal.tsx
 *
 * Convertir un HECHO en TRABAJO. Un compromiso ("X se comprometió a enviar Y") o un insumo del
 * cliente no es una desviación: es algo que alguien debe hacer. Vivía en la lista de
 * particularidades, que no tiene dueño ni fecha ni vencimiento — y por eso nadie lo perseguía.
 *
 * Va en MODAL y no inline porque hay cuatro decisiones (qué, quién, dónde, cuándo) y la fila ya
 * tiene seis chips. Lo que lo hace "sencillo" es el PRELLENADO: en el caso típico el CSE lee y
 * aprieta "Crear tarea" sin tocar nada.
 *
 * Dos detalles que no son cosméticos:
 *  - El eco de la FECHA al lado del selector de semana. Un `weekIndex` no se lee; una fecha sí.
 *  - La microcopy de "Quién lo hace". `party` significa cosas distintas en los dos lados: en la
 *    particularidad es quién CAUSÓ, en la tarea es quién EJECUTA. Es la trampa documentada en
 *    DECISIONS, y contra un criterio humano equivocado no hay test que valga: solo el texto.
 */
import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Input, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { taskTitleFromParticularidad } from "@/lib/timeline/particularidad-to-task";
import { computePhaseRanges, addWeeks, fmtFull } from "@/lib/timeline/weeks";
import { PARTICULARIDAD_KIND_META, type GanttParticularidad, type GanttPhase } from "./TimelineGantt";

export interface ConvertPayload {
  phaseId: string;
  title: string;
  weekIndex: number;
  party: string | null;
  committedDueDate: string | null; // YYYY-MM-DD
}

const PARTY_OPTIONS = [
  { value: "CLIENTE", label: "El cliente" },
  { value: "SMARTEAM", label: "Smarteam" },
  { value: "DEV", label: "Desarrollo" },
  { value: "AMBOS", label: "Ambos" },
];

export default function ParticularidadToTaskModal({
  particularidad,
  phases,
  anchor,
  currentWeek,
  saving,
  onConvert,
  onClose,
}: {
  particularidad: GanttParticularidad;
  phases: GanttPhase[];
  /** Fecha de arranque del cronograma (YYYY-MM-DD). Sin ella no hay fechas, solo números de semana. */
  anchor: string | null;
  /** Semana absoluta de hoy; null si el proyecto no arrancó o no hay anchor. */
  currentWeek: number | null;
  saving: boolean;
  onConvert: (payload: ConvertPayload) => void;
  onClose: () => void;
}) {
  const ranges = computePhaseRanges(phases);

  // Fase por defecto: la que el agente atribuyó al hecho; si no, la que contiene el hoy; si no, la
  // primera. La idea es que el CSE casi nunca tenga que tocar este campo.
  const defaultPhaseIdx = (() => {
    const byId = phases.findIndex((p) => p.id && p.id === particularidad.phaseId);
    if (byId >= 0) return byId;
    if (currentWeek !== null) {
      const byWeek = ranges.findIndex((r) => currentWeek >= r.start && currentWeek < r.end);
      if (byWeek >= 0) return byWeek;
    }
    return 0;
  })();

  const [phaseKey, setPhaseKey] = useState(phases[defaultPhaseIdx]?.key ?? "");
  const [title, setTitle] = useState(taskTitleFromParticularidad(particularidad.title));
  const [party, setParty] = useState<string>(particularidad.party || "SMARTEAM");
  const [dueDate, setDueDate] = useState("");

  const phaseIdx = Math.max(0, phases.findIndex((p) => p.key === phaseKey));
  const phase = phases[phaseIdx];
  const range = ranges[phaseIdx];

  // Semana por defecto dentro de la fase: la actual si el hoy cae adentro, si no la primera. Nunca
  // una semana ya pasada — una tarea que nace vencida arranca mintiendo.
  const semanaSugerida = (() => {
    if (!range || currentWeek === null) return 0;
    if (currentWeek < range.start) return 0;
    if (currentWeek >= range.end) return Math.max((phase?.durationWeeks ?? 1) - 1, 0);
    return currentWeek - range.start;
  })();
  const [weekIndex, setWeekIndex] = useState(semanaSugerida);
  // Al cambiar de fase la semana anterior puede no existir → se recorta.
  const weekSafe = Math.min(weekIndex, Math.max((phase?.durationWeeks ?? 1) - 1, 0));

  // La fecha que el CSE realmente lee. Convención del sistema: la semana vence al terminar.
  const vence =
    anchor && range
      ? fmtFull(addWeeks(anchor, range.start + weekSafe + 1).toISOString())
      : null;

  const kMeta = PARTICULARIDAD_KIND_META[particularidad.kind] ?? {
    label: particularidad.kind,
    cls: "text-fg-muted bg-surface-muted border-line",
  };
  // El hecho sigue explicando el corrimiento (tiene semanas) Y el cliente ya lo lee: al crear la
  // tarea va a recibir el mismo mensaje por dos vías. No lo podemos decidir por él.
  const avisoDobleMensaje = particularidad.visibleExternal && (particularidad.weeksImpact ?? 0) >= 1;
  const saleDelCliente = particularidad.visibleExternal && !particularidad.weeksImpact;

  const canSave = title.trim().length > 0 && !!phase?.id;

  const submit = () => {
    if (!canSave || saving) return;
    onConvert({
      phaseId: phase!.id as string,
      title: title.trim(),
      weekIndex: weekSafe,
      party: party || null,
      committedDueDate: dueDate || null,
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Convertir en tarea"
      description="La particularidad queda como registro de por qué pasó. La tarea es quién lo hace y para cuándo."
      size="md"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="primary" size="sm" onClick={submit} loading={saving} disabled={!canSave}>
            Crear tarea
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        {/* El hecho original, con su evidencia. El CSE decide mirando la cita, no de memoria. */}
        <div className="rounded-xl border border-line bg-surface-muted px-3 py-2.5">
          <div className="flex items-start gap-2">
            <span className={`text-[9px] font-bold uppercase tracking-wider rounded px-1.5 py-0.5 flex-shrink-0 border ${kMeta.cls}`}>
              {kMeta.label}
            </span>
            <p className="text-sm text-fg-secondary leading-snug">{particularidad.title}</p>
          </div>
          {particularidad.sourceQuote && (
            <p className="text-[11px] text-fg-muted italic leading-relaxed mt-1.5">
              <span className="not-italic mr-1">[{particularidad.occurredAt.slice(0, 10)}]</span>
              «{particularidad.sourceQuote}»
            </p>
          )}
        </div>

        <label className="block">
          <span className="text-xs font-medium text-gray-400 mb-1 block">Qué hay que hacer</span>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
            placeholder="Enviar la base de datos de prueba"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-gray-400 mb-1 block">Quién lo hace</span>
            <Select value={party} onChange={(e) => setParty(e.target.value)}>
              {PARTY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
            {/* Contra un criterio humano equivocado no hay test que valga: solo este texto. */}
            <span className="text-[11px] text-gray-500 mt-1 block leading-relaxed">
              Acá es quién la <span className="font-semibold">ejecuta</span>. En la particularidad era
              quién la causó.
            </span>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-400 mb-1 block">Fecha comprometida (opcional)</span>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-gray-400 mb-1 block">Fase</span>
            <Select value={phaseKey} onChange={(e) => setPhaseKey(e.target.value)}>
              {phases.map((p) => (
                <option key={p.key} value={p.key} disabled={!p.id}>
                  {p.name}{!p.id ? " (sin guardar)" : ""}
                </option>
              ))}
            </Select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-400 mb-1 block">Semana</span>
            <Select value={String(weekSafe)} onChange={(e) => setWeekIndex(Number(e.target.value))}>
              {Array.from({ length: Math.max(phase?.durationWeeks ?? 1, 1) }, (_, i) => (
                <option key={i} value={String(i)}>Semana {i + 1}</option>
              ))}
            </Select>
            {/* Sin esto el CSE elige un número, no un momento. */}
            {vence && <span className="text-[11px] text-gray-500 mt-1 block">Vence el {vence}</span>}
          </label>
        </div>

        <p className="text-[11px] text-fg-muted leading-relaxed">
          {party === "CLIENTE"
            ? "Al publicar, el cliente la va a ver en su plan; si vence sin hacerse, aparece en «Pendiente de tu parte»."
            : "El cliente la va a ver como una tarea más del plan."}
        </p>

        {saleDelCliente && (
          <p className="text-[11px] text-fg-secondary leading-relaxed rounded-lg border border-line bg-surface-muted px-3 py-2">
            Este hecho no tiene semanas de atraso, así que <span className="font-semibold">deja de
            mostrarse</span> en «Qué cambió en el plan»: lo que falta ahora lo dice la tarea. Si no,
            el cliente leería lo mismo dos veces.
          </p>
        )}
        {avisoDobleMensaje && (
          <p className="text-[11px] text-amber-300 leading-relaxed rounded-lg border border-amber-700/50 bg-amber-900/20 px-3 py-2">
            El cliente va a leer las dos cosas: el hecho en «Qué cambió en el plan» y la tarea en su
            plan. Revisá que no digan lo mismo.
          </p>
        )}
      </div>
    </Modal>
  );
}
