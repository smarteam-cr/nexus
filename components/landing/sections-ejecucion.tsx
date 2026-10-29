"use client";

/**
 * components/landing/sections-ejecucion.tsx — el plan de ACCIÓN (2026-09-28).
 *
 * El diagnóstico une el problema con códigos (síntomas S, causas F, objetivos OBJ), y cada ACCIÓN
 * (AC-01…) cierra el hilo: dice qué causas ataca y qué objetivos mueve, con qué hub, si es un quick
 * win y si está dentro del alcance contratado. Son las «Acciones coherentes» del diagnóstico de
 * FUNDAUNA. Vivieron en la Ejecución del 28-sep al 2-oct; desde entonces las pinta el DIAGNÓSTICO
 * (el nombre del archivo y los `sectionType` quedaron, para no romper lo ya guardado).
 *
 *   · `ejecucion_acciones`     — la tabla de acciones.
 *     Desde el 2026-10-28 (decisión 16) un diagnóstico NUEVO la tiene corta: el enfoque con tres o cuatro acciones de una
 *     línea (ID · Acción · Ataca · Mueve), y el grupo, el hub, el quick win y el alcance viven en la Planificación, que
 *     monta esta misma tabla entera. La decide `seVeCorta` (lib/canvas/acciones-del-enfoque.ts): un diagnóstico viejo se
 *     ve igual que siempre.
 *   · `ejecucion_herramientas` — qué herramienta de HubSpot se usa, para qué, y en qué AC.
 *
 * Tablas con la clase del motor (`.stl-props`), editables celda por celda. Filas con flechas y no
 * arrastre: un `<div>` dentro de un `<tbody>` es HTML inválido (ver sections-tabla.tsx).
 */
import type { FC } from "react";
import type { SectionProps } from "./types";
import { Editable, RemoveBtn, AddBtn, replaceAt, removeAt, appendItem } from "./inline";
import { ConIntro } from "./partes";
import { accionNueva, seVeCorta } from "@/lib/canvas/acciones-del-enfoque";

export interface AccionEjecucion {
  id: string;
  accion: string;
  detalle: string;
  /* Los cuatro del DETALLE son opcionales: un diagnóstico nuevo no los tiene (lib/canvas/acciones-del-enfoque.ts). */
  /** Planeación · Configuración · Reportería · Adopción… */
  grupo?: string;
  /** Las causas del diagnóstico que ataca: «F1, F2». */
  ataca: string;
  /** Los objetivos del diagnóstico que mueve: «OBJ-01, OBJ-05». */
  mueve: string;
  hub?: string;
  /** «si» | «no». */
  quickWin?: string;
  /** «dentro» | «fuera». */
  alcance?: string;
}
export interface AccionesEjecucionData {
  intro?: string;
  acciones: AccionEjecucion[];
}

export interface HerramientaEjecucion {
  herramienta: string;
  paraQue: string;
  /** Las acciones que la usan: «AC-01, AC-05». */
  acciones: string;
}
export interface HerramientasEjecucionData {
  intro?: string;
  herramientas: HerramientaEjecucion[];
}

const arr = <T,>(v: T[] | undefined): T[] => (Array.isArray(v) ? v : []);
const esSi = (v: string | undefined) => /^s[ií]/i.test((v ?? "").trim());
const esFuera = (v: string | undefined) => /fuera/i.test(v ?? "");
/** Lo que se lee (el cliente, el PDF): «Sí» / «No» / «Dentro» / «Fuera», como en FUNDAUNA. La IA
 *  escribe «si», «no», «dentro»: al editar se ve tal cual está guardado. */
const leerSiNo = (v: string) => (esSi(v) ? "Sí" : /^no\b/i.test((v ?? "").trim()) ? "No" : (v ?? ""));
const leerAlcance = (v: string) =>
  esFuera(v) ? "Fuera" : /dentro/i.test(v ?? "") ? "Dentro" : (v ?? "");

function siguienteAC(usados: string[]): string {
  const n = usados.reduce((m, id) => {
    const r = /^AC-?(\d+)$/i.exec((id ?? "").trim());
    return r ? Math.max(m, Number(r[1])) : m;
  }, 0);
  return `AC-${String(n + 1).padStart(2, "0")}`;
}

export const AccionesEjecucionSection: FC<SectionProps<AccionesEjecucionData>> = ({ data, editable, onChange }) => {
  const acciones = arr(data.acciones);
  const set = (next: Partial<AccionesEjecucionData>) => onChange?.({ ...data, ...next });
  const setCampo = (i: number, campo: keyof AccionEjecucion, v: string) => set({ acciones: replaceAt(acciones, i, { ...acciones[i], [campo]: v }) });
  if (!editable && !acciones.length) return null;
  const corta = seVeCorta(data);
  const celda = (
    i: number,
    campo: keyof AccionEjecucion,
    placeholder: string,
    className?: string,
    paraLeer?: (v: string) => string,
  ) => {
    const guardado = acciones[i][campo] ?? "";
    const valor = !editable && paraLeer ? paraLeer(guardado) : guardado;
    return <Editable as="span" className={className} editable={editable} value={valor} placeholder={placeholder} onCommit={(v) => setCampo(i, campo, v)} />;
  };
  return (
    <ConIntro data={{ ...(data as object), intro: data.intro }} editable={editable} onCambios={(c) => set(c as unknown as Partial<AccionesEjecucionData>)} placeholder="Una frase que enmarca las acciones…">
      <div className="stl-props-scroll">
        <table className="stl-props stl-acciones">
          <thead>
            <tr>
              <th>ID</th>
              <th>Acción</th>
              {!corta && <th>Grupo</th>}
              <th>Ataca</th>
              <th>Mueve</th>
              {!corta && (
                <>
                  <th>Hub</th>
                  <th>Quick win</th>
                  <th>Alcance</th>
                </>
              )}
              {editable && <th className="stl-props-actions" aria-label="Acciones" />}
            </tr>
          </thead>
          <tbody>
            {acciones.map((a, i) => (
              <tr key={i} className={esFuera(a.alcance) ? "stl-accion-fuera" : undefined}>
                <td>{celda(i, "id", "AC-01", "stl-codigo")}</td>
                <td>
                  {celda(i, "accion", "La acción…", "stl-accion-titulo")}
                  <br />
                  {celda(i, "detalle", "Para qué sirve, en una línea…", "stl-accion-detalle")}
                </td>
                {!corta && <td>{celda(i, "grupo", "Configuración", "stl-accion-grupo")}</td>}
                <td>{celda(i, "ataca", "F1")}</td>
                <td>{celda(i, "mueve", "OBJ-01")}</td>
                {!corta && (
                  <>
                    <td>{celda(i, "hub", "Sales Hub")}</td>
                    <td className={esSi(a.quickWin) ? "stl-accion-si" : undefined}>{celda(i, "quickWin", "no", undefined, leerSiNo)}</td>
                    <td className={esFuera(a.alcance) ? "stl-accion-fuera-txt" : "stl-accion-dentro"}>{celda(i, "alcance", "dentro", undefined, leerAlcance)}</td>
                  </>
                )}
                {editable && (
                  <td className="stl-props-actions">
                    <RemoveBtn onClick={() => set({ acciones: removeAt(acciones, i) })} title="Quitar esta acción" />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editable && (
        <AddBtn
          label="Agregar acción"
          onClick={() =>
            set({
              acciones: appendItem(acciones, accionNueva(siguienteAC(acciones.map((a) => a.id)), corta)),
            })
          }
        />
      )}
    </ConIntro>
  );
};

export const HerramientasEjecucionSection: FC<SectionProps<HerramientasEjecucionData>> = ({ data, editable, onChange }) => {
  const filas = arr(data.herramientas);
  const set = (next: Partial<HerramientasEjecucionData>) => onChange?.({ ...data, ...next });
  if (!editable && !filas.length) return null;
  const celda = (i: number, campo: keyof HerramientaEjecucion, placeholder: string, className?: string) => (
    <Editable as="span" className={className} editable={editable} value={filas[i][campo] ?? ""} placeholder={placeholder}
      onCommit={(v) => set({ herramientas: replaceAt(filas, i, { ...filas[i], [campo]: v }) })} />
  );
  return (
    <ConIntro data={{ ...(data as object), intro: data.intro }} editable={editable} onCambios={(c) => set(c as unknown as Partial<HerramientasEjecucionData>)} placeholder="Una frase que enmarca las herramientas…">
      <div className="stl-props-scroll">
        <table className="stl-props">
          <thead>
            <tr>
              <th>Herramienta</th>
              <th>Para qué la vamos a usar</th>
              <th style={{ width: 130 }}>Acciones</th>
              {editable && <th className="stl-props-actions" aria-label="Acciones" />}
            </tr>
          </thead>
          <tbody>
            {filas.map((_, i) => (
              <tr key={i}>
                <td>{celda(i, "herramienta", "Pipelines de negocios", "stl-accion-titulo")}</td>
                <td>{celda(i, "paraQue", "Para qué, en una línea…")}</td>
                <td>{celda(i, "acciones", "AC-01")}</td>
                {editable && (
                  <td className="stl-props-actions">
                    <RemoveBtn onClick={() => set({ herramientas: removeAt(filas, i) })} title="Quitar esta herramienta" />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editable && <AddBtn label="Agregar herramienta" onClick={() => set({ herramientas: appendItem(filas, { herramienta: "", paraQue: "", acciones: "" }) })} />}
    </ConIntro>
  );
};
