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
  weeksImpact: number | null;
  visibleExternal: boolean;
}

const KIND_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "ATRASO", label: "Atraso" },
  { value: "SOLICITUD", label: "Solicitud" },
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
  const [weeks, setWeeks] = useState<string>(
    particularidad.weeksImpact != null ? String(particularidad.weeksImpact) : "",
  );
  const [visible, setVisible] = useState(particularidad.visibleExternal);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const titleValid = title.trim().length > 0;

  const submit = () => {
    if (!titleValid || saving) return;
    const w = weeks.trim() === "" ? null : Math.max(0, Math.round(Number(weeks)));
    onSave({
      kind,
      party,
      title: title.trim(),
      detail: detail.trim() ? detail.trim() : null,
      weeksImpact: Number.isFinite(w as number) ? (w as number | null) : null,
      visibleExternal: visible,
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
            <Button variant="primary" size="sm" onClick={submit} loading={saving} disabled={!titleValid}>
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
                {KIND_OPTIONS.map((o) => (
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
              placeholder="En lenguaje cliente — ej. «Se atrasó la entrega de la base de contactos»"
              autoFocus
            />
            {!titleValid && <span className="text-[11px] text-red-400 mt-1 block">El título no puede quedar vacío.</span>}
          </label>

          <label className="block">
            <span className="text-xs font-medium text-gray-400 mb-1 block">Detalle <span className="text-gray-600">(opcional)</span></span>
            <Textarea value={detail} onChange={(e) => setDetail(e.target.value)} rows={3} placeholder="1-2 frases de contexto." />
          </label>

          <label className="block max-w-[180px]">
            <span className="text-xs font-medium text-gray-400 mb-1 block">Semanas de atraso <span className="text-gray-600">(opcional)</span></span>
            <Input
              type="number"
              min={0}
              value={weeks}
              onChange={(e) => setWeeks(e.target.value)}
              placeholder="—"
            />
          </label>

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
