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
 *
 * Una franja VACÍA no se arrastra y ninguna sesión muestra «—» (reporte de Juan Carlos Armijos,
 * 24 nov): las reglas viven en `lib/kickoff/franjas.ts`, con sus pruebas.
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
import { useBorrador } from "./useBorrador";
import {
  asignacionAlSoltar,
  franjaDeLaSesion,
  franjasLibres,
  tieneTexto,
  ID_DE_FRANJA,
  ID_DE_SESION,
  PISTA_DE_FRANJA,
  type FranjaDeLaSesion,
} from "@/lib/kickoff/franjas";

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
  // Solo franjas/sesiones con label real (un "+ Agregar" sin completar NO debe
  // mostrarle un "—" suelto al cliente).
  const options = franjasLibres(view, { soloConTexto: true });
  const sessions = view.sessions.filter((s) => tieneTexto(s.label));
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
            // Una franja asignada pero vacía cuenta como «por coordinar»: nunca un hueco.
            const asignada = franjaDeLaSesion(view, s, { paraElCliente: true });
            const opt = asignada?.tipo === "franja" ? asignada.franja : null;
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
  option, editable, autoFocus, onFocus, onLabel, onCommit, onRemove,
}: {
  option: HorarioOption;
  editable: boolean;
  /** La franja recién agregada: el cursor queda adentro para escribirla. */
  autoFocus?: boolean;
  onFocus?: () => void;
  onLabel?: (v: string) => void;
  onCommit?: () => void;
  onRemove?: () => void;
}) {
  // Una franja vacía no se arrastra: soltarla en una sesión dejaba «—» (24 nov). `asignacionAlSoltar`
  // la rechaza igual si el arrastre llega.
  const vacia = !tieneTexto(option.label);
  // setNodeRef en el CHIP entero (no solo el handle) → el transform mueve todo el chip
  // y su rect sigue al cursor (necesario para que la detección de drop funcione).
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `${ID_DE_FRANJA}${option.id}`,
    disabled: vacia,
  });
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
        title="Arrástrala a una sesión"
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
        // Vacía: borde punteado y fondo liso, un hueco por llenar y no un horario ya puesto.
        display: "flex", alignItems: "center", gap: 6,
        border: `1px ${vacia ? "dashed" : "solid"} var(--brand-blue)`,
        background: vacia ? "var(--bg)" : "var(--brand-blue-soft)", borderRadius: 999, padding: "4px 6px 4px 10px",
        ...dragStyle,
      }}
    >
      <span
        {...listeners}
        {...attributes}
        title={vacia ? "Escribe la franja para poder arrastrarla" : "Arrastrar a una sesión"}
        style={{
          cursor: vacia ? "default" : "grab", color: vacia ? "var(--text-muted)" : "var(--brand-blue-dark)",
          opacity: vacia ? 0.5 : 1, fontSize: 14, lineHeight: 1, touchAction: "none", userSelect: "none",
        }}
      >
        ⠿
      </span>
      <input
        className="stl-pista"
        value={option.label}
        placeholder={PISTA_DE_FRANJA}
        aria-label="Día y hora de la franja"
        autoFocus={autoFocus}
        onFocus={onFocus}
        onChange={(e) => onLabel?.(e.target.value)}
        onBlur={onCommit}
        // Vacía: tan ancha como el texto de ayuda, que antes se cortaba («Martes 11:0»).
        style={{ border: "none", background: "transparent", outline: "none", fontSize: 14, fontWeight: 600, color: "var(--brand-blue-dark)", width: `${vacia ? PISTA_DE_FRANJA.length + 1 : Math.max(8, option.label.length + 2)}ch`, maxWidth: 260 }}
      />
      <button type="button" onClick={onRemove} title="Quitar franja" style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--brand-blue-dark)", fontSize: 16, lineHeight: 1, padding: "0 4px" }}>
        ×
      </button>
    </div>
  );
}

// ── Recuadro de sesión (droppable) ────────────────────────────────────────────
function DroppableSession({
  id, label, asignada, editable, autoFocus, onFocus, onLabel, onCommit, onRemove, onClearOption,
}: {
  id: string;
  label: string;
  /** Lo que muestra en el lugar de la franja (`lib/kickoff/franjas.ts`). El cliente nunca recibe `sin-texto`. */
  asignada: FranjaDeLaSesion;
  editable: boolean;
  /** La sesión recién agregada: el cursor queda adentro para escribirla. */
  autoFocus?: boolean;
  onFocus?: () => void;
  onLabel?: (v: string) => void;
  onCommit?: () => void;
  onRemove?: () => void;
  onClearOption: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `${ID_DE_SESION}${id}` });
  const quitar = (
    <button type="button" onClick={onClearOption} title="Quitar asignación" style={{ border: "none", background: "transparent", cursor: "pointer", color: "inherit", fontSize: 14, lineHeight: 1 }}>×</button>
  );
  return (
    <div ref={setNodeRef} style={{ display: "flex", alignItems: "center", gap: 10, border: `1.5px ${isOver ? "solid" : "dashed"} ${isOver ? "var(--brand-teal)" : "var(--border-strong)"}`, background: isOver ? "var(--brand-teal-soft)" : "var(--bg)", borderRadius: 12, padding: 10 }}>
      {editable ? (
        <input
          className="stl-edit-input stl-pista"
          value={label}
          placeholder="Nombre de la sesión (ej.: Marketing Hub)"
          aria-label="Nombre de la sesión"
          autoFocus={autoFocus}
          onFocus={onFocus}
          onChange={(e) => onLabel?.(e.target.value)}
          onBlur={onCommit}
          style={{ flex: 1, minWidth: 0 }}
        />
      ) : (
        <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600, color: "var(--text)" }}>{label}</span>
      )}
      <div style={{ flexShrink: 0 }}>
        {asignada?.tipo === "franja" ? (
          <span style={ASSIGNED}>
            {asignada.franja.label}
            {quitar}
          </span>
        ) : asignada?.tipo === "sin-texto" ? (
          // Datos de antes del arreglo: una franja vacía ya asignada. Se dice qué es y se suelta con ×.
          <span style={{ ...ASSIGNED, color: "var(--text-muted)", background: "var(--bg)", border: "1px dashed var(--border-strong)", fontWeight: 600, fontStyle: "italic" }}>
            Franja sin texto
            {quitar}
          </span>
        ) : (
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Arrastra una franja aquí</span>
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
  /* ⭐ Draft LOCAL que SE RE-SIEMBRA cuando `view` cambia por afuera.
     ⚠ El miedo original —«re-sincronizar en cada render mataría el foco mientras el CSE escribe»—
     era cierto para «en cada render» y falso para «solo cuando el contenido cambió»: cada tecla
     hace `setDraft` SIN llamar `onChange` (el commit es en el blur), así que mientras se tipea la
     prop no cambia y esto no dispara. Ver `lib/ui/borrador-sincronizado.ts`. */
  const [draft, setDraft] = useBorrador<HorariosData>(view);
  const [error, setError] = useState<string | null>(null);
  // Id de la franja o sesión recién agregada: monta con el cursor adentro. Antes el CSE quedaba
  // en el botón y escribía en otro lado (la Intro) creyendo que era la franja (24 nov).
  const [enfocar, setEnfocar] = useState<string | null>(null);
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
      setError(e instanceof Error ? e.message : "No se pudo guardar. Inténtalo de nuevo.");
    });
  };

  const onDragEnd = (e: DragEndEvent) => {
    // Rechaza la franja vacía aunque el arrastre llegue (el chip ya no se deja agarrar).
    const asignacion = asignacionAlSoltar(draft, String(e.active.id), e.over ? String(e.over.id) : null);
    if (asignacion) assign(asignacion.sessionId, asignacion.optionId);
  };

  // Cliente: no mostrar franjas ni sesiones a medio nombrar por el CSE.
  const options = franjasLibres(draft, { soloConTexto: !editable });
  const sessions = editable ? draft.sessions : draft.sessions.filter((s) => tieneTexto(s.label));
  /** El cliente ve una franja vacía ya asignada como «sin franja»: puede arrastrarle una de verdad. */
  const asignadaDe = (s: HorariosData["sessions"][number]): FranjaDeLaSesion =>
    franjaDeLaSesion(draft, s, { paraElCliente: !editable });
  const yaEnfocada = () => setEnfocar(null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {editable ? (
        <label className="stl-edit-field">
          {/* Juan Carlos escribió su franja acá creyendo que era el campo de la franja (24 nov). */}
          <span>Párrafo de introducción para el cliente (opcional)</span>
          <input
            className="stl-edit-input stl-pista"
            value={draft.intro ?? ""}
            placeholder="Ej.: Coordinamos sesiones recurrentes con tu equipo. Los horarios van abajo, en las franjas."
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
              {editable ? "Franjas que ofrecemos (un día y una hora en cada una; arrástralas a una sesión)" : "Franjas que ofrecemos — arrastra una a tu sesión"}
            </span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginTop: editable ? undefined : 10 }}>
              {options.map((o) => (
                <DraggableOption
                  key={o.id}
                  option={o}
                  editable={editable}
                  autoFocus={enfocar === o.id}
                  onFocus={yaEnfocada}
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
                  onClick={() => {
                    const id = newId();
                    save({ ...draft, options: [...draft.options, { id, label: "" }] });
                    setEnfocar(id);
                  }}
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
                  asignada={asignadaDe(s)}
                  autoFocus={enfocar === s.id}
                  onFocus={yaEnfocada}
                  onLabel={(v) => setDraft({ ...draft, sessions: draft.sessions.map((x) => (x.id === s.id ? { ...x, label: v } : x)) })}
                  onCommit={() => onChange?.(draft)}
                  onClearOption={() => assign(s.id, null)}
                  onRemove={() => save({ ...draft, sessions: draft.sessions.filter((x) => x.id !== s.id) })}
                />
              ))}
              {editable && (
                <button
                  type="button"
                  onClick={() => {
                    const id = newId();
                    save({ ...draft, sessions: [...draft.sessions, { id, label: "", optionId: null }] });
                    setEnfocar(id);
                  }}
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
