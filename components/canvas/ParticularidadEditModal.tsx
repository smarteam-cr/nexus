"use client";

/**
 * components/canvas/ParticularidadEditModal.tsx
 *
 * Crear o editar una particularidad/aviso (tipo, responsable, título, detalle, fase, semanas de
 * impacto, visibilidad al cliente). Reusa el Modal genérico + Input/Textarea/Select + ConfirmDialog.
 *
 * Dos modos, mismo formulario:
 *  - EDITAR (`particularidad` != null): incluye Eliminar. Sirve igual para las generadas por IA —
 *    se pueden modificar en su totalidad (incluida la FASE a la que están ancladas).
 *  - CREAR (`particularidad` == null): el CSE escribe un aviso propio. Arranca en tipo "Aviso"
 *    (nota libre que NO mueve fechas) y VISIBLE al cliente, porque se escribe para él.
 *
 * El estado del form vive acá; al Guardar emite el patch completo. El padre (CronogramaCanvas) hace
 * el POST/PATCH/DELETE y refresca. Como todo lo del cliente, llega al «Subir al cliente».
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
  phaseId: string | null;
}

// Kinds vigentes. SOLICITUD está deprecado (eje DESTINO: un insumo del cliente es una tarea
// party=CLIENTE, no una particularidad) → se ofrece SOLO como opción "heredado" si la fila YA lo es,
// para poder migrarla; no se puede fijar de nuevo en filas que no lo tengan.
const BASE_KIND_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "ATRASO", label: "Atraso" },
  { value: "COMPROMISO", label: "Compromiso" },
  { value: "AVISO", label: "Aviso (no mueve fechas)" },
];
const PARTY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "CLIENTE", label: "Cliente" },
  { value: "SMARTEAM", label: "Smarteam" },
  { value: "AMBOS", label: "Ambos" },
  { value: "DEV", label: "Desarrollo" },
];

const hoyISO = () => new Date().toISOString().slice(0, 10);

export default function ParticularidadEditModal({
  particularidad,
  phases,
  saving,
  onSave,
  onDelete,
  onClose,
}: {
  /** null = modo CREAR (aviso manual del CSE). */
  particularidad: GanttParticularidad | null;
  /** Fases del cronograma, para anclar/re-anclar el hecho. Solo las ya guardadas (con id). */
  phases?: Array<{ id?: string; name: string }>;
  saving: boolean;
  onSave: (patch: ParticularidadPatch) => void;
  /** Solo en modo editar. */
  onDelete?: () => void;
  onClose: () => void;
}) {
  const creating = particularidad === null;
  const [kind, setKind] = useState(particularidad?.kind ?? "AVISO");
  const [party, setParty] = useState(particularidad?.party ?? "SMARTEAM");
  const [title, setTitle] = useState(particularidad?.title ?? "");
  const [detail, setDetail] = useState(particularidad?.detail ?? "");
  const [sourceQuote, setSourceQuote] = useState(particularidad?.sourceQuote ?? "");
  const [occurredAt, setOccurredAt] = useState(particularidad?.occurredAt.slice(0, 10) ?? hoyISO());
  const [weeks, setWeeks] = useState<string>(
    particularidad?.weeksImpact != null ? String(particularidad.weeksImpact) : "",
  );
  // Un aviso manual se escribe PARA el cliente → nace visible.
  const [visible, setVisible] = useState(particularidad?.visibleExternal ?? true);
  const [phaseId, setPhaseId] = useState<string>(particularidad?.phaseId ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Si la fila es un SOLICITUD legacy, se muestra la opción "heredado" para poder verla/migrarla.
  const legacyKind =
    particularidad && particularidad.kind !== "ATRASO" && particularidad.kind !== "COMPROMISO" && particularidad.kind !== "AVISO";
  const kindOptions = legacyKind
    ? [{ value: particularidad.kind, label: `${particularidad.kind} (heredado)` }, ...BASE_KIND_OPTIONS]
    : BASE_KIND_OPTIONS;

  const phaseOptions = (phases ?? []).filter((p): p is { id: string; name: string } => !!p.id);

  const esAviso = kind === "AVISO";
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
      // Un aviso no mueve fechas: nunca lleva semanas (el endpoint lo normaliza igual).
      weeksImpact: esAviso ? null : weeksNum,
      visibleExternal: visible,
      occurredAt,
      phaseId: phaseId || null,
    });
  };

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={creating ? "Nuevo aviso" : "Editar particularidad"}
        description={
          creating
            ? "Escribile al cliente algo que deba saber del cronograma. Llega al cliente al «Subir al cliente»."
            : "Ajustá el texto que verá el cliente. Los cambios llegan al cliente al «Subir al cliente»."
        }
        size="md"
        footer={
          <>
            {!creating && onDelete && (
              <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)} disabled={saving} className="mr-auto">
                Eliminar
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button variant="primary" size="sm" onClick={submit} loading={saving} disabled={!canSave}>
              {creating ? "Crear aviso" : "Guardar"}
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

          {phaseOptions.length > 0 && (
            <label className="block">
              <span className="text-xs font-medium text-fg-secondary mb-1 block">
                Fase <span className="text-fg-muted">(opcional — a qué parte del plan corresponde)</span>
              </span>
              <Select value={phaseId} onChange={(e) => setPhaseId(e.target.value)}>
                <option value="">Sin fase</option>
                {phaseOptions.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </label>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-gray-400 mb-1 block">Fecha del hecho</span>
              <Input type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
              {!occurredValid && <span className="text-[11px] text-red-400 mt-1 block">Poné la fecha del hecho.</span>}
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-400 mb-1 block">
                Semanas de atraso{" "}
                {esAviso ? (
                  <span className="text-fg-muted">(no aplica)</span>
                ) : kind === "ATRASO" ? (
                  <span className="text-red-400">(obligatorio)</span>
                ) : (
                  <span className="text-gray-600">(opcional)</span>
                )}
              </span>
              <Input
                type="number"
                min={0}
                value={esAviso ? "" : weeks}
                onChange={(e) => setWeeks(e.target.value)}
                disabled={esAviso}
                placeholder={esAviso ? "Un aviso no mueve fechas" : "—"}
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
        onConfirm={() => { setConfirmDelete(false); onDelete?.(); }}
      />
    </>
  );
}
