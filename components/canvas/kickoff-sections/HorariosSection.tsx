"use client";

/**
 * HorariosSection — sección CURADA "Sesiones y horarios" del Kickoff.
 *
 * TRES modos, un solo componente:
 *   · CSE (`editable`)            — define franjas y sesiones (textos, agregar, quitar)
 *                                   y las asigna arrastrando.
 *   · Cliente (`onAssignSession`) — NO edita textos; solo arrastra una franja a una
 *                                   sesión. Auto-save optimista contra la server action.
 *   · Lectura pura               — estático (PDF, preview, snapshot sin action).
 *
 * La ASIGNACIÓN no vive en el bloque: es un overlay vivo en `Project.kickoffHorarioAssignments`
 * (ver lib/kickoff/horario-assignments.ts) que escriben ambas puntas al instante, sin publicar.
 * `data.sessions[].optionId` ya llega con el overlay aplicado. Los textos (franjas, sesiones)
 * sí son contenido del bloque → cambiarlos exige "Subir al cliente".
 *
 * Una franja asignada se CONSUME: desaparece de "Franjas que ofrecemos" en los tres modos.
 */
import { useState } from "react";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { SectionProps } from "@/components/landing/types";
import { normalizeHorarios, newId, type HorariosData, type HorarioOption } from "./types";

/** Franjas todavía SIN asignar — las únicas que se ofrecen (en los 3 modos). */
function freeOptions(view: HorariosData): HorarioOption[] {
  const taken = new Set(view.sessions.map((s) => s.optionId).filter(Boolean));
  return view.options.filter((o) => !taken.has(o.id));
}

const CHIP: React.CSSProperties = {
  fontSize: 14, fontWeight: 600, color: "var(--brand-blue-dark)", background: "var(--brand-blue-soft)",
  border: "1px solid var(--brand-blue)", borderRadius: 999, padding: "6px 14px",
};
const ASSIGNED: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700,
  color: "var(--brand-teal-dark)", background: "var(--brand-teal-soft)",
  border: "1px solid var(--brand-teal)", borderRadius: 999, padding: "5px 10px",
};
const SECTION_LABEL: React.CSSProperties = {
  fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-secondary)",
};

// ── Read puro (sin interacción) ───────────────────────────────────────────────
function HorariosRead({ view }: { view: HorariosData }) {
  const optById = new Map(view.options.map((o) => [o.id, o]));
  // Solo franjas/sesiones con label real (un "+ Agregar" sin completar NO debe
  // mostrarle un "—" suelto al cliente).
  const options = freeOptions(view).filter((o) => (o.label ?? "").trim());
  const sessions = view.sessions.filter((s) => (s.label ?? "").trim());
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      {view.intro && <p className="stl-prose">{view.intro}</p>}

      {options.length > 0 && (
        <div>
          <span style={SECTION_LABEL}>Franjas que ofrecemos</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
            {options.map((o) => (
              <span key={o.id} style={CHIP}>{o.label}</span>
            ))}
          </div>
        </div>
      )}

      {sessions.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sessions.map((s) => {
            const opt = s.optionId ? optById.get(s.optionId) : null;
            return (
              <div key={s.id} className="card" style={{ padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>{s.label}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: opt ? "var(--brand-teal-dark)" : "var(--text-muted)", flexShrink: 0 }}>
                  {opt ? opt.label : "Por coordinar"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Chip de franja arrastrable ────────────────────────────────────────────────
// `editable` decide si el label es un input y si hay ×. El drag existe en ambos modos.
function DraggableOption({
  option, editable, onLabel, onCommit, onRemove,
}: {
  option: HorarioOption;
  editable: boolean;
  onLabel?: (v: string) => void;
  onCommit?: () => void;
  onRemove?: () => void;
}) {
  // setNodeRef en el CHIP entero (no solo el handle) → el transform mueve todo el chip
  // y su rect sigue al cursor (necesario para que la detección de drop funcione).
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `opt:${option.id}` });
  const dragStyle: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.9 : 1,
    zIndex: isDragging ? 50 : undefined,
    position: isDragging ? "relative" : undefined,
    boxShadow: isDragging ? "0 8px 20px rgba(0,0,0,0.22)" : undefined,
  };

  // Cliente: el chip ENTERO es el handle (no hay ⠿ ni input que compitan por el gesto).
  if (!editable) {
    return (
      <span
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        title="Arrastrala a una sesión"
        style={{ ...CHIP, ...dragStyle, cursor: "grab", touchAction: "none", userSelect: "none" }}
      >
        ⠿ {option.label}
      </span>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        display: "flex", alignItems: "center", gap: 6, border: "1px solid var(--brand-blue)",
        background: "var(--brand-blue-soft)", borderRadius: 999, padding: "4px 6px 4px 10px",
        ...dragStyle,
      }}
    >
      <span
        {...listeners}
        {...attributes}
        title="Arrastrar a una sesión"
        style={{ cursor: "grab", color: "var(--brand-blue-dark)", fontSize: 14, lineHeight: 1, touchAction: "none", userSelect: "none" }}
      >
        ⠿
      </span>
      <input
        value={option.label}
        placeholder="Martes 11:00"
        onChange={(e) => onLabel?.(e.target.value)}
        onBlur={onCommit}
        style={{ border: "none", background: "transparent", outline: "none", fontSize: 14, fontWeight: 600, color: "var(--brand-blue-dark)", width: `${Math.max(8, option.label.length + 2)}ch`, maxWidth: 200 }}
      />
      <button type="button" onClick={onRemove} title="Quitar franja" style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--brand-blue-dark)", fontSize: 16, lineHeight: 1, padding: "0 4px" }}>
        ×
      </button>
    </div>
  );
}

// ── Recuadro de sesión (droppable) ────────────────────────────────────────────
function DroppableSession({
  id, label, optionLabel, hasOption, editable, onLabel, onCommit, onRemove, onClearOption,
}: {
  id: string;
  label: string;
  optionLabel: string | null;
  hasOption: boolean;
  editable: boolean;
  onLabel?: (v: string) => void;
  onCommit?: () => void;
  onRemove?: () => void;
  onClearOption: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `sess:${id}` });
  return (
    <div ref={setNodeRef} style={{ display: "flex", alignItems: "center", gap: 10, border: `1.5px ${isOver ? "solid" : "dashed"} ${isOver ? "var(--brand-teal)" : "var(--border-strong)"}`, background: isOver ? "var(--brand-teal-soft)" : "var(--bg)", borderRadius: 12, padding: 10 }}>
      {editable ? (
        <input
          className="stl-edit-input"
          value={label}
          placeholder="Marketing Hub"
          onChange={(e) => onLabel?.(e.target.value)}
          onBlur={onCommit}
          style={{ flex: 1, minWidth: 0 }}
        />
      ) : (
        <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600, color: "var(--text)" }}>{label}</span>
      )}
      <div style={{ flexShrink: 0 }}>
        {hasOption ? (
          <span style={ASSIGNED}>
            {optionLabel || "—"}
            <button type="button" onClick={onClearOption} title="Quitar asignación" style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--brand-teal-dark)", fontSize: 14, lineHeight: 1 }}>×</button>
          </span>
        ) : (
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Arrastrá una franja acá</span>
        )}
      </div>
      {editable && (
        <button type="button" onClick={onRemove} title="Quitar sesión" className="btn-secondary-light" style={{ padding: "0 10px", flexShrink: 0 }}>
          Quitar
        </button>
      )}
    </div>
  );
}

export default function HorariosSection({ data, ctx, editable = false, onChange }: SectionProps<HorariosData>) {
  const view = normalizeHorarios(data);
  const onAssign = ctx.kickoff?.onAssignSession;
  // El cliente interactúa si hay dónde persistir; el CSE siempre.
  const interactive = editable || !!onAssign;

  if (!interactive) return <HorariosRead view={view} />;
  return <HorariosInteractive view={view} editable={editable} onAssign={onAssign} onChange={onChange} />;
}

function HorariosInteractive({
  view, editable, onAssign, onChange,
}: {
  view: HorariosData;
  editable: boolean;
  onAssign?: (sessionId: string, optionId: string | null) => Promise<void>;
  onChange?: (data: HorariosData) => void;
}) {
  // Draft LOCAL: se siembra una vez. Re-sincronizarlo con `view` en cada render mataría
  // el foco mientras el CSE escribe (cada tecla sube por onChange y vuelve como prop).
  const [draft, setDraft] = useState<HorariosData>(() => view);
  const [error, setError] = useState<string | null>(null);
  // TouchSensor: el cliente entra desde el móvil. `delay` distingue el drag del scroll.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );

  const save = (next: HorariosData) => {
    setDraft(next);
    onChange?.(next);
  };

  /**
   * Asigna optimista y persiste SOLO por el overlay — nunca por `onChange`: la asignación
   * es coordinación, y escribirla en el bloque marcaría el kickoff como "con cambios sin
   * subir". Si el servidor rechaza (la franja o la sesión dejaron de existir), revierte y
   * avisa: la UI nunca queda mintiendo.
   *
   * El optimista y el rollback son QUIRÚRGICOS: updater funcional, solo las dos sesiones que
   * este arrastre tocó, y solo si nadie las pisó después. Restaurar un snapshot completo del
   * draft desharía los arrastres posteriores que ya estaban en vuelo cuando este falla.
   */
  const assign = (sessionId: string, optionId: string | null) => {
    // Estado que este arrastre pisa: la franja anterior de la sesión destino, y la sesión a la
    // que se le "roba" la franja (es exclusiva). Se leen DENTRO del updater porque dos arrastres
    // en el mismo tick verían un `draft` viejo; el valor del render es solo la semilla.
    let prevOptionId = draft.sessions.find((s) => s.id === sessionId)?.optionId ?? null;
    let stolenFrom = optionId
      ? draft.sessions.find((s) => s.id !== sessionId && s.optionId === optionId)?.id ?? null
      : null;

    setDraft((cur) => {
      prevOptionId = cur.sessions.find((s) => s.id === sessionId)?.optionId ?? null;
      stolenFrom = optionId
        ? cur.sessions.find((s) => s.id !== sessionId && s.optionId === optionId)?.id ?? null
        : null;
      return {
        ...cur,
        sessions: cur.sessions.map((s) => {
          if (s.id === sessionId) return { ...s, optionId };
          if (optionId && s.optionId === optionId) return { ...s, optionId: null }; // exclusividad
          return s;
        }),
      };
    });
    setError(null);
    if (!onAssign) return;

    void onAssign(sessionId, optionId).catch((e: unknown) => {
      setDraft((cur) => ({
        ...cur,
        // CONDICIONAL: se revierte solo lo que este arrastre puso y sigue puesto. Si otro
        // arrastre posterior ya reasignó la sesión, ese valor es el que quedó en el servidor
        // (última escritura gana, serializada por `FOR UPDATE`) y deshacerlo dejaría la UI
        // mintiendo al revés.
        sessions: cur.sessions.map((s) => {
          if (s.id === sessionId && s.optionId === optionId) return { ...s, optionId: prevOptionId };
          if (stolenFrom && s.id === stolenFrom && s.optionId === null) return { ...s, optionId }; // devolverle su franja
          return s;
        }),
      }));
      setError(e instanceof Error ? e.message : "No se pudo guardar. Intentá de nuevo.");
    });
  };

  const onDragEnd = (e: DragEndEvent) => {
    const activeId = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    if (!overId || !activeId.startsWith("opt:") || !overId.startsWith("sess:")) return;
    assign(overId.slice(5), activeId.slice(4));
  };

  const optLabel = (optionId: string | null) => draft.options.find((o) => o.id === optionId)?.label ?? null;
  // Cliente: no mostrar franjas ni sesiones a medio nombrar por el CSE.
  const options = editable ? freeOptions(draft) : freeOptions(draft).filter((o) => (o.label ?? "").trim());
  const sessions = editable ? draft.sessions : draft.sessions.filter((s) => (s.label ?? "").trim());

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {editable ? (
        <label className="stl-edit-field">
          <span>Intro (opcional)</span>
          <input
            className="stl-edit-input"
            value={draft.intro ?? ""}
            placeholder="Coordinamos sesiones recurrentes con tu equipo."
            onChange={(e) => setDraft({ ...draft, intro: e.target.value })}
            onBlur={() => onChange?.(draft)}
          />
        </label>
      ) : (
        draft.intro && <p className="stl-prose">{draft.intro}</p>
      )}

      {error && (
        <p role="alert" style={{ fontSize: 13, fontWeight: 600, color: "var(--danger, #dc2626)" }}>{error}</p>
      )}

      {/* `id` FIJO: sin él, dnd-kit deriva el `aria-describedby` de un contador de módulo
          que arranca distinto en el servidor y en el cliente → hydration mismatch. Antes no
          se notaba porque el DndContext solo existía en el editor (nunca en SSR); ahora la
          página del cliente también lo monta. Hay una sola sección de horarios por página. */}
      <DndContext id="kickoff-horarios" sensors={sensors} collisionDetection={pointerWithin} onDragEnd={onDragEnd}>
        {(editable || options.length > 0) && (
          <div className="stl-edit-field">
            <span style={editable ? undefined : SECTION_LABEL}>
              {editable ? "Franjas que ofrecemos (arrastralas a una sesión)" : "Franjas que ofrecemos — arrastrá una a tu sesión"}
            </span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginTop: editable ? undefined : 10 }}>
              {options.map((o) => (
                <DraggableOption
                  key={o.id}
                  option={o}
                  editable={editable}
                  onLabel={(v) => setDraft({ ...draft, options: draft.options.map((x) => (x.id === o.id ? { ...x, label: v } : x)) })}
                  onCommit={() => onChange?.(draft)}
                  onRemove={() => save({
                    ...draft,
                    options: draft.options.filter((x) => x.id !== o.id),
                    // limpiar asignaciones que apuntaban a la franja borrada
                    sessions: draft.sessions.map((s) => (s.optionId === o.id ? { ...s, optionId: null } : s)),
                  })}
                />
              ))}
              {editable && (
                <button
                  type="button"
                  onClick={() => save({ ...draft, options: [...draft.options, { id: newId(), label: "" }] })}
                  className="btn-secondary-light"
                  style={{ padding: "6px 12px", fontSize: 13 }}
                >
                  + Agregar franja
                </button>
              )}
            </div>
          </div>
        )}

        {(editable || sessions.length > 0) && (
          <div className="stl-edit-field">
            <span style={editable ? undefined : SECTION_LABEL}>Sesiones</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: editable ? undefined : 10 }}>
              {sessions.map((s) => (
                <DroppableSession
                  key={s.id}
                  id={s.id}
                  label={s.label}
                  editable={editable}
                  hasOption={!!s.optionId}
                  optionLabel={optLabel(s.optionId)}
                  onLabel={(v) => setDraft({ ...draft, sessions: draft.sessions.map((x) => (x.id === s.id ? { ...x, label: v } : x)) })}
                  onCommit={() => onChange?.(draft)}
                  onClearOption={() => assign(s.id, null)}
                  onRemove={() => save({ ...draft, sessions: draft.sessions.filter((x) => x.id !== s.id) })}
                />
              ))}
              {editable && (
                <button
                  type="button"
                  onClick={() => save({ ...draft, sessions: [...draft.sessions, { id: newId(), label: "", optionId: null }] })}
                  className="btn-secondary-light"
                  style={{ alignSelf: "flex-start", padding: "7px 12px", fontSize: 13 }}
                >
                  + Agregar sesión
                </button>
              )}
            </div>
          </div>
        )}
      </DndContext>
    </div>
  );
}
