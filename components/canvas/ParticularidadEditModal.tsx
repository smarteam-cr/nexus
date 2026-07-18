"use client";

/**
 * components/canvas/ParticularidadEditModal.tsx
 *
 * Edición del CONTENIDO de una particularidad ya creada (tipo, responsable, título, detalle,
 * semanas de impacto, visibilidad al cliente). Reusa el Modal genérico + Input/Textarea/Select +
 * ConfirmDialog. El estado del form vive acá (seed desde el item); al Guardar emite el patch
 * completo, al Eliminar dispara onDelete (con confirmación). El padre (CronogramaCanvas) hace el
 * PATCH/DELETE y refresca su estado local; la visibilidad recién llega al cliente al «Subir».
 */
import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Input, Textarea, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { GanttParticularidad } from "./TimelineGantt";

export interface ParticularidadPatch {
  kind: string;
  party: string;
  title: string;
  detail: string | null;
  sourceQuote: string | null;
  weeksImpact: number | null;
  visibleExternal: boolean;
  occurredAt: string; // YYYY-MM-DD
}

// Kinds vigentes. SOLICITUD está deprecado (eje DESTINO: un insumo del cliente es una tarea
// party=CLIENTE, no una particularidad) → se ofrece SOLO como opción "heredado" si la fila YA lo es,
// para poder migrarla; no se puede fijar de nuevo en filas que no lo tengan.
const BASE_KIND_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "ATRASO", label: "Atraso" },
  { value: "COMPROMISO", label: "Compromiso" },
];
const PARTY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "CLIENTE", label: "Cliente" },
  { value: "SMARTEAM", label: "Smarteam" },
  { value: "AMBOS", label: "Ambos" },
  { value: "DEV", label: "Desarrollo" },
];

export default function ParticularidadEditModal({
  particularidad,
  saving,
  onSave,
  onDelete,
  onClose,
}: {
  particularidad: GanttParticularidad;
  saving: boolean;
  onSave: (patch: ParticularidadPatch) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [kind, setKind] = useState(particularidad.kind);
  const [party, setParty] = useState(particularidad.party);
  const [title, setTitle] = useState(particularidad.title);
  const [detail, setDetail] = useState(particularidad.detail ?? "");
  const [sourceQuote, setSourceQuote] = useState(particularidad.sourceQuote ?? "");
  const [occurredAt, setOccurredAt] = useState(particularidad.occurredAt.slice(0, 10));
  const [weeks, setWeeks] = useState<string>(
    particularidad.weeksImpact != null ? String(particularidad.weeksImpact) : "",
  );
  const [visible, setVisible] = useState(particularidad.visibleExternal);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Si la fila es un SOLICITUD legacy, se muestra la opción "heredado" para poder verla/migrarla.
  const kindOptions =
    particularidad.kind !== "ATRASO" && particularidad.kind !== "COMPROMISO"
      ? [{ value: particularidad.kind, label: `${particularidad.kind} (heredado)` }, ...BASE_KIND_OPTIONS]
      : BASE_KIND_OPTIONS;

  const titleValid = title.trim().length > 0;
  const weeksNum = weeks.trim() === "" ? null : Math.max(0, Math.round(Number(weeks)));
  const weeksValid = weeksNum === null || Number.isFinite(weeksNum);
  // Un ATRASO exige semanas de corrimiento ≥1 (mismo invariante que el endpoint).
  const atrasoNeedsWeeks = kind === "ATRASO" && (weeksNum === null || weeksNum < 1);
  const occurredValid = occurredAt.trim().length > 0;
  const canSave = titleValid && weeksValid && !atrasoNeedsWeeks && occurredValid;

  const submit = () => {
    if (!canSave || saving) return;
    onSave({
      kind,
      party,
      title: title.trim(),
      detail: detail.trim() ? detail.trim() : null,
      sourceQuote: sourceQuote.trim() ? sourceQuote.trim() : null,
      weeksImpact: weeksNum,
      visibleExternal: visible,
      occurredAt,
    });
  };

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title="Editar particularidad"
        description="Ajustá el texto que verá el cliente. Los cambios llegan al cliente al «Subir al cliente»."
        size="md"
        footer={
          <>
            <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)} disabled={saving} className="mr-auto">
              Eliminar
            </Button>
            <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button variant="primary" size="sm" onClick={submit} loading={saving} disabled={!canSave}>
              Guardar
            </Button>
          </>
        }
      >
        <div className="space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-gray-400 mb-1 block">Tipo</span>
              <Select value={kind} onChange={(e) => setKind(e.target.value)}>
                {kindOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-400 mb-1 block">Responsable</span>
              <Select value={party} onChange={(e) => setParty(e.target.value)}>
                {PARTY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-medium text-gray-400 mb-1 block">Título</span>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Lo lee el cliente — ej. «Se reprogramó la migración de datos» (sin jerga interna)"
              autoFocus
            />
            {!titleValid && <span className="text-[11px] text-red-400 mt-1 block">El título no puede quedar vacío.</span>}
          </label>

          <label className="block">
            <span className="text-xs font-medium text-gray-400 mb-1 block">Detalle <span className="text-gray-600">(opcional)</span></span>
            <Textarea value={detail} onChange={(e) => setDetail(e.target.value)} rows={3} placeholder="1-2 frases de contexto." />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-gray-400 mb-1 block">
              Cita interna <span className="text-gray-600">(opcional — solo la ve el equipo, no cruza al cliente)</span>
            </span>
            <Textarea value={sourceQuote} onChange={(e) => setSourceQuote(e.target.value)} rows={2} placeholder="Fragmento de la sesión que respalda el hecho." />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-gray-400 mb-1 block">Fecha del hecho</span>
              <Input type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
              {!occurredValid && <span className="text-[11px] text-red-400 mt-1 block">Poné la fecha del hecho.</span>}
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-400 mb-1 block">
                Semanas de atraso {kind === "ATRASO" ? <span className="text-red-400">(obligatorio)</span> : <span className="text-gray-600">(opcional)</span>}
              </span>
              <Input
                type="number"
                min={0}
                value={weeks}
                onChange={(e) => setWeeks(e.target.value)}
                placeholder="—"
              />
              {atrasoNeedsWeeks && <span className="text-[11px] text-red-400 mt-1 block">Un atraso necesita al menos 1 semana.</span>}
            </label>
          </div>

          <label className="flex items-center gap-2.5 pt-1 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={visible}
              onChange={(e) => setVisible(e.target.checked)}
              className="h-4 w-4 accent-emerald-500"
            />
            <span className="text-sm text-gray-200">Visible al cliente</span>
            <span className="text-[11px] text-gray-500">— se aplica al «Subir al cliente»</span>
          </label>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        title="¿Eliminar la particularidad?"
        description="Se borra del cronograma. Si estaba visible, dejará de verla el cliente al próximo «Subir»."
        confirmLabel="Eliminar"
        z="z-[60]"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => { setConfirmDelete(false); onDelete(); }}
      />
    </>
  );
}
