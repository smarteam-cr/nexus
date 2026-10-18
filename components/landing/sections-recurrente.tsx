"use client";

/**
 * components/landing/sections-recurrente.tsx — las secciones propias de la PROPUESTA DE UN SERVICIO RECURRENTE
 * (roadmap «La siguiente serie», iniciativa 3, paso 2; defs en configs/recurrente.defs.ts).
 *
 *  · `OperacionDelServicioSection`: cómo opera — la cadencia y las reuniones fijas.
 *  · `CicloDelServicioSection`: cómo trabajamos — las etapas del ciclo dibujadas COMO UN CICLO (SmartLoop), con la
 *    geometría de lib/servicios/circulo.ts, la misma que la tarjeta de la etapa del Resumen.
 *  · `NivelDeServicioSection`: el nivel de servicio — una prioridad por tarjeta, con su tiempo de respuesta.
 *
 * Nacen de lo que Ventas armó a mano en HTML para Cayalá y Grupo Inve, ahora con las clases del motor y los colores de
 * marca: se editan en el lugar, se imprimen en el PDF (SVG estático, sin timers) y se leen igual en las dos superficies.
 */
import type { CSSProperties, FC } from "react";
import { Editable, RemoveBtn, AddBtn, replaceAt, removeAt, appendItem } from "./inline";
import { SortableItems } from "./sortable";
import type { SectionProps } from "./types";
import { arcoEntre, puntosDelCirculo } from "@/lib/servicios/circulo";

interface Rutina {
  titulo: string;
  cada?: string;
  detalle?: string;
}
interface OperacionData {
  intro?: string;
  rutinas?: Rutina[];
  nota?: string;
}

const GRID: CSSProperties = { display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", marginTop: 8 };
const CHIP: CSSProperties = {
  display: "inline-block",
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "var(--blue)",
  marginBottom: 8,
};

export const OperacionDelServicioSection: FC<SectionProps<OperacionData>> = ({ data, editable, onChange }) => {
  const rutinas = data.rutinas ?? [];
  const set = (next: Partial<OperacionData>) => onChange?.({ ...data, ...next });
  return (
    <>
      {(data.intro || editable) && (
        <Editable as="p" className="stl-body" editable={editable} value={data.intro ?? ""} placeholder="La cadencia del servicio, en una frase…" onCommit={(v) => set({ intro: v })} />
      )}
      <SortableItems items={rutinas} disabled={!editable} onReorder={(next) => set({ rutinas: next })} container={(nodes) => <div style={GRID}>{nodes}</div>}>
        {(r, i, handle) => (
          <div className="stl-item stl-card">
            {handle}
            {editable && <RemoveBtn onClick={() => set({ rutinas: removeAt(rutinas, i) })} />}
            <div style={CHIP}><Editable as="span" editable={editable} value={r.cada ?? ""} placeholder="Cada semana · 45 min" onCommit={(v) => set({ rutinas: replaceAt(rutinas, i, { ...r, cada: v }) })}/></div>
            <Editable as="div" className="stl-card-title" editable={editable} value={r.titulo} placeholder="Nombre de la reunión…" onCommit={(v) => set({ rutinas: replaceAt(rutinas, i, { ...r, titulo: v }) })} />
            <Editable as="p" className="stl-card-detail" editable={editable} value={r.detalle ?? ""} placeholder="Para qué es y con quién…" onCommit={(v) => set({ rutinas: replaceAt(rutinas, i, { ...r, detalle: v }) })} />
          </div>
        )}
      </SortableItems>
      {editable && <AddBtn label="Agregar reunión fija" onClick={() => set({ rutinas: appendItem(rutinas, { titulo: "", cada: "", detalle: "" }) })} />}
      {(data.nota || editable) && (
        <Editable as="p" className="stl-invest-note" editable={editable} value={data.nota ?? ""} placeholder="Cómo se gobierna el plan de trabajo…" onCommit={(v) => set({ nota: v })} />
      )}
    </>
  );
};

interface Etapa {
  titulo: string;
  detalle?: string;
}
interface CicloData {
  intro?: string;
  etapas?: Etapa[];
  nota?: string;
}

const ANCHO = 360;
const ALTO = 300;
const R = 112;

/** El ciclo dibujado: cada etapa un nodo numerado, las flechas en el sentido del reloj y la última vuelve a la primera. */
function DibujoDelCiclo({ etapas }: { etapas: Etapa[] }) {
  const cx = ANCHO / 2;
  const cy = ALTO / 2;
  const puntos = puntosDelCirculo(etapas.length, R, cx, cy);
  return (
    <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} role="img" aria-label={`El ciclo: ${etapas.map((e) => e.titulo).join(", ")}, y vuelve a empezar.`} style={{ width: "100%", maxWidth: 420, height: "auto" }}>
      <defs>
        <marker id="stl-ciclo-flecha" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#0B58D3" />
        </marker>
      </defs>
      <circle cx={cx} cy={cy} r={R - 34} fill="#eef3fc" />
      {puntos.map((_, i) => (
        <path key={`a${i}`} d={arcoEntre(i, etapas.length, R, cx, cy, 13)} fill="none" stroke="#0B58D3" strokeWidth={2} markerEnd="url(#stl-ciclo-flecha)" />
      ))}
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize={13} fontWeight={700} fill="#051849">
        Ciclo continuo
      </text>
      <text x={cx} y={cy + 14} textAnchor="middle" fontSize={11} fill="#3b4a6b">
        aprender → volver a empezar
      </text>
      {puntos.map((p, i) => (
        <g key={`n${i}`}>
          <circle cx={p.x} cy={p.y} r={20} fill={i === 0 ? "#051849" : "#ffffff"} stroke="#051849" strokeWidth={2} />
          <text x={p.x} y={p.y + 5} textAnchor="middle" fontSize={13} fontWeight={800} fill={i === 0 ? "#ffffff" : "#051849"}>
            {String(i + 1).padStart(2, "0")}
          </text>
        </g>
      ))}
    </svg>
  );
}

export const CicloDelServicioSection: FC<SectionProps<CicloData>> = ({ data, editable, onChange }) => {
  const etapas = data.etapas ?? [];
  const set = (next: Partial<CicloData>) => onChange?.({ ...data, ...next });
  return (
    <>
      {(data.intro || editable) && (
        <Editable as="p" className="stl-body" editable={editable} value={data.intro ?? ""} placeholder="Cómo trabaja el servicio, en una frase…" onCommit={(v) => set({ intro: v })} />
      )}
      <div style={{ display: "grid", gap: 24, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", alignItems: "center", marginTop: 8 }}>
        {etapas.length >= 3 && (
          <div style={{ display: "flex", justifyContent: "center" }}>
            <DibujoDelCiclo etapas={etapas} />
          </div>
        )}
        <div>
          <SortableItems items={etapas} disabled={!editable} onReorder={(next) => set({ etapas: next })} container={(nodes) => <div>{nodes}</div>}>
            {(e, i, handle) => (
              <div className="stl-item stl-phase">
                {handle}
                {editable && <RemoveBtn onClick={() => set({ etapas: removeAt(etapas, i) })} />}
                <div className="stl-phase-num">{String(i + 1).padStart(2, "0")}</div>
                <div style={{ flex: 1 }}>
                  <Editable as="div" className="stl-phase-name" editable={editable} value={e.titulo} placeholder="Nombre de la etapa…" onCommit={(v) => set({ etapas: replaceAt(etapas, i, { ...e, titulo: v }) })} />
                  <Editable as="p" className="stl-body" editable={editable} value={e.detalle ?? ""} placeholder="Qué pasa en esta etapa…" onCommit={(v) => set({ etapas: replaceAt(etapas, i, { ...e, detalle: v }) })} />
                </div>
              </div>
            )}
          </SortableItems>
          {editable && <AddBtn label="Agregar etapa" onClick={() => set({ etapas: appendItem(etapas, { titulo: "", detalle: "" }) })} />}
        </div>
      </div>
      {(data.nota || editable) && (
        <Editable as="p" className="stl-invest-note" editable={editable} value={data.nota ?? ""} placeholder="Lo que se lleva cada vuelta a la siguiente…" onCommit={(v) => set({ nota: v })} />
      )}
    </>
  );
};

interface Nivel {
  prioridad: string;
  tiempo: string;
  detalle?: string;
}
interface NivelData {
  intro?: string;
  niveles?: Nivel[];
  nota?: string;
}

const TIEMPO: CSSProperties = {
  fontFamily: "var(--font-jakarta), system-ui, sans-serif",
  fontWeight: 800,
  fontSize: 30,
  lineHeight: 1,
  letterSpacing: "-0.02em",
  color: "var(--blue)",
  margin: "4px 0 10px",
};

export const NivelDeServicioSection: FC<SectionProps<NivelData>> = ({ data, editable, onChange }) => {
  const niveles = data.niveles ?? [];
  const set = (next: Partial<NivelData>) => onChange?.({ ...data, ...next });
  return (
    <>
      {(data.intro || editable) && (
        <Editable as="p" className="stl-body" editable={editable} value={data.intro ?? ""} placeholder="Cómo se clasifica cada solicitud…" onCommit={(v) => set({ intro: v })} />
      )}
      <SortableItems items={niveles} disabled={!editable} onReorder={(next) => set({ niveles: next })} container={(nodes) => <div style={GRID}>{nodes}</div>}>
        {(n, i, handle) => (
          <div className="stl-item stl-card">
            {handle}
            {editable && <RemoveBtn onClick={() => set({ niveles: removeAt(niveles, i) })} />}
            <div style={CHIP}><Editable as="span" editable={editable} value={n.prioridad} placeholder="Prioridad…" onCommit={(v) => set({ niveles: replaceAt(niveles, i, { ...n, prioridad: v }) })}/></div>
            <div style={TIEMPO}><Editable as="div" editable={editable} value={n.tiempo} placeholder="4 h" onCommit={(v) => set({ niveles: replaceAt(niveles, i, { ...n, tiempo: v }) })}/></div>
            <Editable as="p" className="stl-card-detail" editable={editable} value={n.detalle ?? ""} placeholder="Qué entra en esta prioridad…" onCommit={(v) => set({ niveles: replaceAt(niveles, i, { ...n, detalle: v }) })} />
          </div>
        )}
      </SortableItems>
      {editable && <AddBtn label="Agregar prioridad" onClick={() => set({ niveles: appendItem(niveles, { prioridad: "", tiempo: "", detalle: "" }) })} />}
      {(data.nota || editable) && (
        <Editable as="p" className="stl-invest-note" editable={editable} value={data.nota ?? ""} placeholder="Qué cubren los tiempos…" onCommit={(v) => set({ nota: v })} />
      )}
    </>
  );
};
