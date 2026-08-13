"use client";

/**
 * components/landing/sections-impacto.tsx — «Lo que nos contaron».
 *
 * La ÚNICA sección con componente propio del canvas Entrega. Las otras ocho reusan
 * renderers que ya existen; ésta no puede, porque lo que rinde no es una métrica: es un
 * dicho, y un dicho sin quién lo dijo no es un dato.
 *
 * ── EL PROBLEMA QUE RESUELVE ─────────────────────────────────────────────────
 * Los números del negocio del cliente —tiempo de respuesta, tasa de cierre, volumen— NO
 * existen en Nexus: no los mide ni los puede consultar. Pero se DICEN en las reuniones
 * («pasamos de 18 a 7 días»). Decisión de Elías (2026-08-12): que el agente los busque ahí y
 * los PROPONGA; si no encuentra, que el CSE los agregue.
 *
 * ── LAS DOS LISTAS, Y POR QUÉ SON DOS ────────────────────────────────────────
 *   · `kpisPropuestos` — DENTRO del schema. Los extrae el agente de las transcripciones, con
 *     la cita textual. Regenerar los pisa, y está bien: es una propuesta, no una decisión.
 *   · `kpisConfirmados` — FUERA del schema, en el PRIMER nivel del `data` (hasta donde llega
 *     `preserveNonSchemaKeys`, que es shallow). Los escribe el CSE al aceptar.
 *
 * **Se renderiza SOLO lo confirmado.** Un número que salió de una transcripción no cruza al
 * cliente sin que un humano lo mire — la misma doctrina que el cronograma («el agente
 * propone, el CSE confirma»). Las propuestas se ven únicamente en edición.
 *
 * ── LA ATRIBUCIÓN NO ES DECORACIÓN ───────────────────────────────────────────
 * Cada tarjeta confirmada lleva quién lo dijo y cuándo, en el cuerpo del texto y no en gris
 * chico. Es lo que separa «Nexus lo midió» de «nos lo contaron», y sin esa línea el número
 * se lee como una medición nuestra. Una tarjeta sin `quien` se pinta igual pero dice
 * «Según el equipo del cliente» — nunca se calla la procedencia.
 */
import type { FC } from "react";
import type { SectionProps } from "./types";
import { Editable, RemoveBtn, AddBtn, replaceAt, removeAt, appendItem } from "./inline";
import { SortableItems } from "./sortable";

export interface KpiDeclarado {
  label: string;
  valor: string;
  cita?: string;
  quien?: string;
  cuando?: string;
}

export interface ImpactoData {
  intro: string;
  /** Propuestas del agente desde las sesiones. Solo se ven en edición. */
  kpisPropuestos: KpiDeclarado[];
  /** Lo que el CSE aceptó. Es LO ÚNICO que ve el cliente. Fuera del schema del agente. */
  kpisConfirmados?: KpiDeclarado[];
}

/** «Según María Pérez, Gerente Comercial — 12 de junio de 2026», sin inventar lo que falta. */
function atribucion(k: KpiDeclarado): string {
  const quien = k.quien?.trim() || "el equipo del cliente";
  const cuando = k.cuando?.trim();
  return cuando ? `Según ${quien} — ${cuando}` : `Según ${quien}`;
}

export const ImpactoSection: FC<SectionProps<ImpactoData>> = ({ data, editable, onChange }) => {
  const propuestos = data.kpisPropuestos ?? [];
  const confirmados = data.kpisConfirmados ?? [];
  const set = (next: Partial<ImpactoData>) => onChange?.({ ...data, ...next });

  /* Aceptar MUEVE: sale de propuestos y entra a confirmados. Si se quedara en las dos listas,
     una regeneración del agente reviviría la propuesta que el CSE ya resolvió. */
  const aceptar = (i: number) =>
    set({
      kpisConfirmados: [...confirmados, propuestos[i]],
      kpisPropuestos: removeAt(propuestos, i),
    });

  return (
    <>
      <Editable
        as="p"
        className="stl-lead"
        editable={editable}
        value={data.intro ?? ""}
        placeholder="Lo que el equipo nos contó que cambió…"
        onCommit={(v) => set({ intro: v })}
      />

      {/* ── Lo confirmado: lo ÚNICO que ve el cliente ── */}
      <SortableItems
        items={confirmados}
        disabled={!editable}
        onReorder={(next) => set({ kpisConfirmados: next })}
        container={(nodes) => <div className="stl-grid stl-grid-3">{nodes}</div>}
      >
        {(k, i, handle) => (
          <div className="stl-item stl-metric">
            {handle}
            {editable && <RemoveBtn onClick={() => set({ kpisConfirmados: removeAt(confirmados, i) })} />}
            <Editable
              as="div"
              className="stl-metric-value"
              editable={editable}
              value={k.valor}
              placeholder="de 18 a 7 días"
              onCommit={(v) => set({ kpisConfirmados: replaceAt(confirmados, i, { ...k, valor: v }) })}
            />
            <Editable
              as="div"
              className="stl-metric-label"
              editable={editable}
              value={k.label}
              placeholder="Tiempo de respuesta a un lead"
              onCommit={(v) => set({ kpisConfirmados: replaceAt(confirmados, i, { ...k, label: v }) })}
            />
            {/* La procedencia viaja con el número, siempre. */}
            <div className="stl-kpi-fuente">{atribucion(k)}</div>
          </div>
        )}
      </SortableItems>

      {editable && (
        <AddBtn
          label="Agregar un dato del cliente"
          onClick={() => set({ kpisConfirmados: appendItem(confirmados, { label: "", valor: "", quien: "" }) })}
        />
      )}

      {/* ── Las propuestas del agente: SOLO en edición, nunca en lectura ── */}
      {editable && propuestos.length > 0 && (
        <div className="stl-kpi-propuestas">
          <p className="stl-kpi-propuestas-titulo">
            Nexus encontró {propuestos.length} {propuestos.length === 1 ? "número" : "números"} en las reuniones.
            Revisá la cita antes de aceptar — al cliente solo le llega lo que aceptes.
          </p>
          {propuestos.map((k, i) => (
            <div key={`${k.label}-${i}`} className="stl-kpi-propuesta">
              <div className="stl-kpi-propuesta-dato">
                <strong>{k.valor || "(sin valor)"}</strong> — {k.label || "(sin rótulo)"}
              </div>
              {k.cita && <blockquote className="stl-kpi-propuesta-cita">«{k.cita}»</blockquote>}
              <div className="stl-kpi-propuesta-fuente">{atribucion(k)}</div>
              <div className="stl-kpi-propuesta-acciones">
                <button type="button" className="stl-kpi-aceptar" onClick={() => aceptar(i)}>
                  Aceptar
                </button>
                <button
                  type="button"
                  className="stl-kpi-descartar"
                  onClick={() => set({ kpisPropuestos: removeAt(propuestos, i) })}
                >
                  Descartar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
};
