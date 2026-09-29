"use client";

/**
 * components/landing/sections-diagnostico.tsx — las secciones del HILO del diagnóstico.
 *
 * ── POR QUÉ EXISTEN ──────────────────────────────────────────────────────────────────────────
 * El diagnóstico de referencia (FUNDAUNA, 2026-09-27) encadena todo con CÓDIGOS: cada síntoma (S)
 * lo explica una causa (F), cada causa tiene una consecuencia, y los objetivos (OBJ) dicen qué se
 * va a medir. Después, el canvas de Ejecución suma las acciones (AC) que atacan esas F y mueven
 * esos OBJ. Nada queda suelto, y el CSE le puede decir al chat «cambia la F3».
 *
 * Ningún renderer del motor tenía esa forma: `pain` son tarjetas sueltas y `tabla` no sabe de
 * códigos. Por eso tres secciones propias:
 *   · `diagnostico_objetivos` — OBJ cuantitativos y cualitativos, cada uno con cómo se mide.
 *   · `diagnostico_problema`  — síntomas → causas → consecuencias, en tres columnas, con los
 *                               códigos que las unen. (El diagrama de líneas del original NO se
 *                               copió: en pantalla se ve bien y en el PDF no se lee.)
 *   · `diagnostico_preguntas` — las preguntas de negocio que hoy no se pueden responder, cada una
 *                               atada a su OBJ.
 *
 * Los códigos son TEXTO («F1», «S1, S3»): así los edita una persona, los escribe el chat y
 * sobreviven a `coerceToSchema`, que aplana las hojas a string.
 */
import type { FC } from "react";
import type { SectionProps } from "./types";
import { Editable, RemoveBtn, AddBtn, replaceAt, removeAt, appendItem } from "./inline";

// ── Tipos ────────────────────────────────────────────────────────────────────────────────────

export interface ObjetivoDiagnostico {
  id: string;
  /** "cuantitativo" | "cualitativo" (texto; cualquier otra cosa cae en cuantitativo). */
  tipo: string;
  titulo: string;
  /** Cómo se mide y la meta: «Línea base tras el go-live; meta por validar». */
  medida: string;
}
export interface ObjetivosDiagnosticoData {
  intro?: string;
  objetivos: ObjetivoDiagnostico[];
}

export interface SintomaDiagnostico {
  id: string;
  titulo: string;
  detalle: string;
}
export interface CausaDiagnostico {
  id: string;
  titulo: string;
  detalle: string;
  /** Los síntomas que explica: «S1, S3». */
  explica: string;
}
export interface ConsecuenciaDiagnostico {
  titulo: string;
  detalle: string;
  /** Las causas que la producen: «F1, F2». */
  por: string;
}
export interface ProblemaDiagnosticoData {
  intro?: string;
  sintomas: SintomaDiagnostico[];
  causas: CausaDiagnostico[];
  consecuencias: ConsecuenciaDiagnostico[];
}

export interface PreguntaDiagnostico {
  pregunta: string;
  /** Los objetivos que la responden: «OBJ-01». */
  objetivos: string;
}
export interface PreguntasDiagnosticoData {
  intro?: string;
  preguntas: PreguntaDiagnostico[];
}

// ── Piezas ───────────────────────────────────────────────────────────────────────────────────

const arr = <T,>(v: T[] | undefined): T[] => (Array.isArray(v) ? v : []);

/**
 * La plaquita del código (OBJ-01, F3, S2). Editable como cualquier texto. `hueco` = con borde y sin
 * relleno: los objetivos CUALITATIVOS, para que el tipo se reconozca también cuando el código
 * aparece suelto (no hace falta un color por objetivo: ya van agrupados).
 */
function Codigo({ value, editable, onCommit, placeholder, hueco }: { value: string; editable?: boolean; onCommit: (v: string) => void; placeholder: string; hueco?: boolean }) {
  if (!editable && !value) return null;
  return (
    <Editable as="span" className={hueco ? "stl-codigo stl-codigo-hueco" : "stl-codigo"} editable={editable} value={value} placeholder={placeholder} onCommit={onCommit} />
  );
}

/** «Explica S1, S3» / «Por F2»: la referencia a la otra columna. */
function Refs({ rotulo, value, editable, onCommit, placeholder }: { rotulo: string; value: string; editable?: boolean; onCommit: (v: string) => void; placeholder: string }) {
  if (!editable && !value.trim()) return null;
  return (
    <p className="stl-refs">
      <span>{rotulo}</span>{" "}
      <Editable as="span" editable={editable} value={value} placeholder={placeholder} onCommit={onCommit} />
    </p>
  );
}

function Intro({ value, editable, onCommit, placeholder }: { value?: string; editable?: boolean; onCommit: (v: string) => void; placeholder: string }) {
  if (!editable && !value) return null;
  return <Editable as="p" className="stl-lead" editable={editable} value={value ?? ""} placeholder={placeholder} onCommit={onCommit} />;
}

/** El siguiente código libre de una serie: F1…Fn → F(n+1). Solo para el botón «Agregar». */
function siguiente(prefijo: string, usados: string[], ancho = 1): string {
  const n = usados.reduce((max, id) => {
    const m = new RegExp(`^${prefijo}-?(\\d+)$`, "i").exec(id.trim());
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
  const num = String(n + 1).padStart(ancho, "0");
  return prefijo === "OBJ" ? `OBJ-${num}` : `${prefijo}${num}`;
}

// ── Objetivos ────────────────────────────────────────────────────────────────────────────────

const esCualitativo = (tipo: string) => /cuali/i.test(tipo ?? "");

export const ObjetivosDiagnosticoSection: FC<SectionProps<ObjetivosDiagnosticoData>> = ({ data, editable, onChange }) => {
  const objetivos = arr(data.objetivos);
  const set = (next: Partial<ObjetivosDiagnosticoData>) => onChange?.({ ...data, ...next });
  const grupos: Array<{ titulo: string; cuali: boolean }> = [
    { titulo: "Objetivos cuantitativos", cuali: false },
    { titulo: "Objetivos cualitativos", cuali: true },
  ];
  return (
    <>
      <Intro value={data.intro} editable={editable} onCommit={(v) => set({ intro: v })} placeholder="Una frase que enmarca los objetivos (opcional)…" />
      {/* Un grupo por FILA y no dos columnas: con 2 cuantitativos y 6 cualitativos, las columnas
          dejaban un hueco del alto de cuatro tarjetas (FUNDAUNA, 2026-09-28). */}
      <div className="stl-obj-grupos">
        {grupos.map((g) => {
          const delGrupo = objetivos.map((o, i) => ({ o, i })).filter(({ o }) => esCualitativo(o.tipo) === g.cuali);
          if (!editable && !delGrupo.length) return null;
          return (
            <div key={g.titulo}>
              <h3 className="stl-obj-titulo">{g.titulo}</h3>
              <div className="stl-grid stl-grid-3 stl-obj-lista">
                {delGrupo.map(({ o, i }) => (
                  <div key={i} className="stl-item stl-card stl-obj">
                    {editable && <RemoveBtn onClick={() => set({ objetivos: removeAt(objetivos, i) })} />}
                    <Codigo value={o.id} editable={editable} placeholder="OBJ-01" hueco={g.cuali}
                      onCommit={(v) => set({ objetivos: replaceAt(objetivos, i, { ...o, id: v }) })} />
                    <Editable as="h3" className="stl-card-title" editable={editable} value={o.titulo} placeholder="Qué se quiere lograr…"
                      onCommit={(v) => set({ objetivos: replaceAt(objetivos, i, { ...o, titulo: v }) })} />
                    <Editable as="p" className="stl-card-detail stl-obj-medida" editable={editable} value={o.medida} placeholder="Cómo se mide y cuál es la meta…"
                      onCommit={(v) => set({ objetivos: replaceAt(objetivos, i, { ...o, medida: v }) })} />
                  </div>
                ))}
              </div>
              {editable && (
                <AddBtn
                  label={g.cuali ? "Agregar objetivo cualitativo" : "Agregar objetivo cuantitativo"}
                  onClick={() =>
                    set({
                      objetivos: appendItem(objetivos, {
                        id: siguiente("OBJ", objetivos.map((x) => x.id), 2),
                        tipo: g.cuali ? "cualitativo" : "cuantitativo",
                        titulo: "",
                        medida: "",
                      }),
                    })
                  }
                />
              )}
            </div>
          );
        })}
      </div>
    </>
  );
};

// ── Síntomas → causas → consecuencias ────────────────────────────────────────────────────────

export const ProblemaDiagnosticoSection: FC<SectionProps<ProblemaDiagnosticoData>> = ({ data, editable, onChange }) => {
  const sintomas = arr(data.sintomas);
  const causas = arr(data.causas);
  const consecuencias = arr(data.consecuencias);
  const set = (next: Partial<ProblemaDiagnosticoData>) => onChange?.({ ...data, ...next });

  return (
    <>
      <Intro value={data.intro} editable={editable} onCommit={(v) => set({ intro: v })} placeholder="Una frase que enmarca el problema (opcional)…" />
      <div className="stl-hilo">
        <div className="stl-hilo-col stl-hilo-sintomas">
          <h3 className="stl-hilo-titulo">Síntomas <span>lo que se ve hoy</span></h3>
          {sintomas.map((s, i) => (
            <div key={i} className="stl-item stl-hilo-card">
              {editable && <RemoveBtn onClick={() => set({ sintomas: removeAt(sintomas, i) })} />}
              <Codigo value={s.id} editable={editable} placeholder="S1" onCommit={(v) => set({ sintomas: replaceAt(sintomas, i, { ...s, id: v }) })} />
              <Editable as="h4" className="stl-hilo-card-titulo" editable={editable} value={s.titulo} placeholder="El síntoma…"
                onCommit={(v) => set({ sintomas: replaceAt(sintomas, i, { ...s, titulo: v }) })} />
              <Editable as="p" className="stl-hilo-card-detalle" editable={editable} value={s.detalle} placeholder="Con el dato que lo muestra…"
                onCommit={(v) => set({ sintomas: replaceAt(sintomas, i, { ...s, detalle: v }) })} />
            </div>
          ))}
          {editable && (
            <AddBtn label="Agregar síntoma" onClick={() => set({ sintomas: appendItem(sintomas, { id: siguiente("S", sintomas.map((x) => x.id)), titulo: "", detalle: "" }) })} />
          )}
        </div>

        <div className="stl-hilo-col stl-hilo-causas">
          <h3 className="stl-hilo-titulo">Causas <span>por qué pasa</span></h3>
          {causas.map((c, i) => (
            <div key={i} className="stl-item stl-hilo-card">
              {editable && <RemoveBtn onClick={() => set({ causas: removeAt(causas, i) })} />}
              <Codigo value={c.id} editable={editable} placeholder="F1" onCommit={(v) => set({ causas: replaceAt(causas, i, { ...c, id: v }) })} />
              <Editable as="h4" className="stl-hilo-card-titulo" editable={editable} value={c.titulo} placeholder="La causa…"
                onCommit={(v) => set({ causas: replaceAt(causas, i, { ...c, titulo: v }) })} />
              <Editable as="p" className="stl-hilo-card-detalle" editable={editable} value={c.detalle} placeholder="Cómo se manifiesta…"
                onCommit={(v) => set({ causas: replaceAt(causas, i, { ...c, detalle: v }) })} />
              <Refs rotulo="Explica" value={c.explica ?? ""} editable={editable} placeholder="S1, S2"
                onCommit={(v) => set({ causas: replaceAt(causas, i, { ...c, explica: v }) })} />
            </div>
          ))}
          {editable && (
            <AddBtn label="Agregar causa" onClick={() => set({ causas: appendItem(causas, { id: siguiente("F", causas.map((x) => x.id)), titulo: "", detalle: "", explica: "" }) })} />
          )}
        </div>

        <div className="stl-hilo-col stl-hilo-consecuencias">
          <h3 className="stl-hilo-titulo">Qué te cuesta <span>cómo se pierde dinero</span></h3>
          {consecuencias.map((k, i) => (
            <div key={i} className="stl-item stl-hilo-card">
              {editable && <RemoveBtn onClick={() => set({ consecuencias: removeAt(consecuencias, i) })} />}
              <Editable as="h4" className="stl-hilo-card-titulo" editable={editable} value={k.titulo} placeholder="La consecuencia…"
                onCommit={(v) => set({ consecuencias: replaceAt(consecuencias, i, { ...k, titulo: v }) })} />
              <Editable as="p" className="stl-hilo-card-detalle" editable={editable} value={k.detalle} placeholder="En plata, tiempo o clientes…"
                onCommit={(v) => set({ consecuencias: replaceAt(consecuencias, i, { ...k, detalle: v }) })} />
              <Refs rotulo="Por" value={k.por ?? ""} editable={editable} placeholder="F1"
                onCommit={(v) => set({ consecuencias: replaceAt(consecuencias, i, { ...k, por: v }) })} />
            </div>
          ))}
          {editable && (
            <AddBtn label="Agregar consecuencia" onClick={() => set({ consecuencias: appendItem(consecuencias, { titulo: "", detalle: "", por: "" }) })} />
          )}
        </div>
      </div>
    </>
  );
};

// ── Preguntas que hoy no se pueden responder ─────────────────────────────────────────────────

export const PreguntasDiagnosticoSection: FC<SectionProps<PreguntasDiagnosticoData>> = ({ data, editable, onChange }) => {
  const preguntas = arr(data.preguntas);
  const set = (next: Partial<PreguntasDiagnosticoData>) => onChange?.({ ...data, ...next });
  if (!editable && !preguntas.length) return null;
  return (
    <>
      <Intro value={data.intro} editable={editable} onCommit={(v) => set({ intro: v })} placeholder="Una frase que enmarca las preguntas (opcional)…" />
      <div className="stl-props-scroll">
        <table className="stl-props">
          <thead>
            <tr>
              <th>Pregunta de negocio</th>
              <th style={{ width: 140 }}>Objetivo</th>
              {editable && <th className="stl-props-actions" aria-label="Acciones" />}
            </tr>
          </thead>
          <tbody>
            {preguntas.map((p, i) => (
              <tr key={i}>
                <td>
                  <Editable as="span" editable={editable} value={p.pregunta} placeholder="¿Qué pregunta no puede responder hoy?"
                    onCommit={(v) => set({ preguntas: replaceAt(preguntas, i, { ...p, pregunta: v }) })} />
                </td>
                <td>
                  <Editable as="span" className="stl-codigo" editable={editable} value={p.objetivos} placeholder="OBJ-01"
                    onCommit={(v) => set({ preguntas: replaceAt(preguntas, i, { ...p, objetivos: v }) })} />
                </td>
                {editable && (
                  <td className="stl-props-actions">
                    <RemoveBtn onClick={() => set({ preguntas: removeAt(preguntas, i) })} title="Quitar esta pregunta" />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editable && <AddBtn label="Agregar pregunta" onClick={() => set({ preguntas: appendItem(preguntas, { pregunta: "", objetivos: "" }) })} />}
    </>
  );
};
