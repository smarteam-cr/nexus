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
 * códigos. Por eso secciones propias:
 *   · `diagnostico_objetivos` — OBJ cuantitativos y cualitativos, cada uno con cómo se mide.
 *   · `diagnostico_problema`  — síntomas → causas → consecuencias negativas → consecuencias
 *                               positivas (las acciones y cómo generan dinero, leídas de la tabla de
 *                               Acciones por `ctx.diagnostico`), con los códigos que las unen. (El
 *                               diagrama de líneas del original NO se copió: en pantalla se ve bien
 *                               y en el PDF no se lee.)
 *   · `diagnostico_preguntas` — las preguntas de negocio que se van a poder responder, cada una
 *                               atada a su OBJ.
 *   · `diagnostico_politica`  — la política rectora: la prosa de siempre, más el aviso INTERNO
 *                               «Sugerencia por revisar» mientras el ejecutivo no la revisa.
 *   · `diagnostico_equipos`   — equipos involucrados y licencias (tabla de FUNDAUNA).
 *   · `diagnostico_alcance`   — el alcance acordado, por hub, con sus acciones.
 * (Las acciones y las herramientas reusan los renderers de sections-ejecucion.tsx.)
 *
 * Los códigos son TEXTO («F1», «S1, S3»): así los edita una persona, los escribe el chat y
 * sobreviven a `coerceToSchema`, que aplana las hojas a string.
 */
import type { FC } from "react";
import type { CtxDelDiagnostico, HeroData, SectionProps } from "./types";
import { HeroSection } from "./sections";
import { Editable, RemoveBtn, AddBtn, replaceAt, removeAt, appendItem } from "./inline";
import { KickoffProseSection } from "@/components/canvas/kickoff-sections/KickoffSections";
import { SUGERENCIA_POR_REVISAR } from "./configs/diagnostico.defs";

// ── Tipos ────────────────────────────────────────────────────────────────────────────────────

export interface ObjetivoDiagnostico {
  id: string;
  /** "cuantitativo" | "cualitativo" (texto; cualquier otra cosa cae en cuantitativo). */
  tipo: string;
  titulo: string;
  /** Cómo se mide: «Tasa de conversión por proyecto y modalidad». */
  medida: string;
  /**
   * Solo cuantitativos (2026-10-02): el resultado medible del HANDOFF al que apunta («R1»). La línea
   * base, la meta y el plazo se muestran desde ahí (`ctx.diagnostico.resultados`), no se copian.
   */
  resultado?: string;
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

export interface EquipoDiagnostico {
  equipo: string;
  personas: string;
  rol: string;
  /** El asiento o la licencia; «Por validar» si nadie lo dijo. */
  licencia: string;
}
export interface EquiposDiagnosticoData {
  intro?: string;
  equipos: EquipoDiagnostico[];
}

export interface ItemDeAlcance {
  texto: string;
  /** Las acciones que lo cubren: «AC-01, AC-03». */
  acciones: string;
}
export interface AlcanceDiagnosticoData {
  intro?: string;
  grupos: Array<{ titulo: string; items: ItemDeAlcance[] }>;
  /** Lo que quedó fuera: la siguiente conversación. */
  fuera: ItemDeAlcance[];
}

/** La política rectora: prosa + la marca de revisión (FUERA del esquema del agente). */
export interface PoliticaDiagnosticoData {
  intro?: string;
  items?: Array<{ title: string; detail: string }>;
  /**
   * Cuándo la revisó el ejecutivo (ISO). Ausente = sigue siendo la sugerencia de la IA. Va en el
   * PRIMER nivel y fuera del esquema: `preserveNonSchemaKeys` la acarrea, y el agente no la puede
   * escribir. Con ella puesta, regenerar no pisa la política (diagnostico-generate.ts).
   */
  revisadaAt?: string;
  [k: string]: unknown;
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

const SIN_DATO = /^\s*$|^(⚠️?\s*)?por (validar|definir|confirmar)\.?$/i;

type ResultadoDelCtx = NonNullable<CtxDelDiagnostico["resultados"]>[number];

/**
 * La línea base, la meta y el plazo de un objetivo cuantitativo, leídos del resultado medible del
 * HANDOFF al que apunta (se capturan una sola vez). Sin línea base: «Por validar», como pidió Elías.
 * En edición se completan acá mismo y se guardan en el handoff (`onEditarResultado`).
 */
function DatosDelResultado({
  r,
  editable,
  onEditar,
}: {
  r: ResultadoDelCtx | undefined;
  editable?: boolean;
  onEditar?: (id: string, campo: "lineaBase" | "meta" | "plazo", valor: string) => void;
}) {
  const lineaBase = r?.lineaBase ?? "";
  // Sin línea base, o sin confirmar por el CSE (la IA propone, el CSE confirma): «Por validar».
  const porValidar = SIN_DATO.test(lineaBase) || (!!r && !r.confirmadoAt);
  const puedeEditar = !!(editable && r && onEditar);
  const campo = (rotulo: string, k: "lineaBase" | "meta" | "plazo", valor: string) => {
    const vacio = SIN_DATO.test(valor);
    if (!puedeEditar && vacio) return k === "plazo" ? null : <span>{rotulo}: por validar</span>;
    return (
      <span>
        {rotulo}:{" "}
        <Editable as="span" editable={puedeEditar} value={vacio ? "" : valor} placeholder="por validar"
          onCommit={(v) => r && onEditar?.(r.id, k, v)} />
      </span>
    );
  };
  return (
    <div className="stl-obj-datos">
      {porValidar && <span className="stl-obj-por-validar">Por validar</span>}
      {campo("Línea base", "lineaBase", lineaBase)}
      {campo("Meta", "meta", r?.meta ?? "")}
      {campo("Plazo", "plazo", r?.plazo ?? "")}
      {editable && r && <span className="stl-obj-fuente">Del handoff ({r.id})</span>}
    </div>
  );
}

export const ObjetivosDiagnosticoSection: FC<SectionProps<ObjetivosDiagnosticoData>> = ({ data, ctx, editable, onChange }) => {
  const objetivos = arr(data.objetivos);
  const set = (next: Partial<ObjetivosDiagnosticoData>) => onChange?.({ ...data, ...next });
  const resultados = new Map((ctx?.diagnostico?.resultados ?? []).map((r) => [r.id.toUpperCase(), r]));
  const onEditar = ctx?.diagnostico?.onEditarResultado;
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
                    <Editable as="p" className="stl-card-detail stl-obj-medida" editable={editable} value={o.medida} placeholder={g.cuali ? "Cómo se va a notar…" : "Cómo se mide…"}
                      onCommit={(v) => set({ objetivos: replaceAt(objetivos, i, { ...o, medida: v }) })} />
                    {/* La línea base, la meta y el plazo de un cuantitativo vienen del handoff. Sin
                        canal (otro documento que reuse el renderer) no se pinta nada. */}
                    {!g.cuali && ctx?.diagnostico && (
                      <DatosDelResultado r={resultados.get((o.resultado ?? "").trim().toUpperCase())} editable={editable} onEditar={onEditar} />
                    )}
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

export const ProblemaDiagnosticoSection: FC<SectionProps<ProblemaDiagnosticoData>> = ({ data, ctx, editable, onChange }) => {
  const sintomas = arr(data.sintomas);
  const causas = arr(data.causas);
  const consecuencias = arr(data.consecuencias);
  const set = (next: Partial<ProblemaDiagnosticoData>) => onChange?.({ ...data, ...next });
  /* La cuarta columna de FUNDAUNA sale de la tabla de Acciones del MISMO documento: se lee, no se
     escribe acá. Sin el canal (otro documento que reuse este renderer), la columna no existe. */
  const acciones = (ctx?.diagnostico?.acciones ?? []).filter((a) => a.accion || a.id);
  const conPositivas = !!ctx?.diagnostico && (acciones.length > 0 || !!editable);

  return (
    <>
      <Intro value={data.intro} editable={editable} onCommit={(v) => set({ intro: v })} placeholder="Una frase que enmarca el problema (opcional)…" />
      <div className={conPositivas ? "stl-hilo stl-hilo-4" : "stl-hilo"}>
        <div className="stl-hilo-col stl-hilo-sintomas">
          <h3 className="stl-hilo-titulo">Síntomas actuales <span>lo que se ve hoy</span></h3>
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
          <h3 className="stl-hilo-titulo">Consecuencias negativas <span>¿cómo me hace perder dinero?</span></h3>
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

        {conPositivas && (
          <div className="stl-hilo-col stl-hilo-positivas">
            <h3 className="stl-hilo-titulo">Consecuencias positivas <span>acciones coherentes y cómo generan dinero</span></h3>
            {acciones.map((a, i) => (
              <div key={i} className="stl-hilo-card">
                {a.id && <span className="stl-codigo">{a.id}</span>}
                <h4 className="stl-hilo-card-titulo">{a.accion}</h4>
                {a.detalle && <p className="stl-hilo-card-detalle">{a.detalle}</p>}
                {a.ataca && (
                  <p className="stl-refs">
                    <span>Ataca</span> {a.ataca}
                  </p>
                )}
              </div>
            ))}
            {editable && (
              <p className="stl-hilo-nota">
                {acciones.length ? "Se editan en «Acciones coherentes»." : "Se llena sola con la tabla de «Acciones coherentes»."}
              </p>
            )}
          </div>
        )}
      </div>
    </>
  );
};

// ── Preguntas que se van a poder responder ───────────────────────────────────────────────────

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

// ── Portada (con la línea del documento) ─────────────────────────────────────────────────────

/**
 * La portada de siempre (la del Business Case) más la línea de FUNDAUNA: «Cliente · Fecha · Versión ·
 * Estado». La línea la arma Nexus desde el estado del documento (`ctx.diagnostico.lineaDelDocumento`);
 * sin canal, la portada queda como siempre.
 */
export const DiagnosticoHeroSection: FC<SectionProps<HeroData>> = (props) => {
  const linea = props.ctx?.diagnostico?.lineaDelDocumento;
  return (
    <>
      <HeroSection {...props} />
      {linea && <p className="stl-doc-meta">{linea}</p>}
    </>
  );
};

// ── Política rectora (con su marca de revisión) ──────────────────────────────────────────────

function fechaCorta(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("es-CR", { day: "numeric", month: "long", timeZone: "America/Costa_Rica" });
}

/**
 * La política rectora es una SUGERENCIA de la IA hasta que el ejecutivo la revisa (2026-10-02): casi
 * nunca se habla en las sesiones. El aviso es INTERNO: solo existe en edición, así que no llega ni al
 * modo lectura ni al PDF. Sin revisar, el diagnóstico no se presenta.
 */
export const PoliticaDiagnosticoSection: FC<SectionProps<PoliticaDiagnosticoData>> = (props) => {
  const { data, editable, onChange } = props;
  const revisada = typeof data?.revisadaAt === "string" && data.revisadaAt !== "";
  const tieneContenido = !!(data?.intro || (Array.isArray(data?.items) && data.items.length));
  return (
    <>
      {editable && tieneContenido && (
        <div className={revisada ? "stl-sugerencia stl-sugerencia-ok" : "stl-sugerencia"} role="note">
          <span>
            {revisada
              ? `Revisada${fechaCorta(data.revisadaAt!) ? ` el ${fechaCorta(data.revisadaAt!)}` : ""}. Regenerar el diagnóstico ya no la cambia.`
              : `${SUGERENCIA_POR_REVISAR}: la propuso la IA porque casi nunca se habla en las sesiones. Ajústala y márcala como revisada antes de presentar.`}
          </span>
          <button
            type="button"
            onClick={() => onChange?.({ ...data, revisadaAt: revisada ? "" : new Date().toISOString() })}
          >
            {revisada ? "Volver a sugerencia" : "Marcar como revisada"}
          </button>
        </div>
      )}
      {/* La prosa de siempre: el mismo renderer que el resto de las secciones de texto. */}
      <KickoffProseSection {...(props as unknown as Parameters<typeof KickoffProseSection>[0])} />
    </>
  );
};

// ── Equipos involucrados y licencias ─────────────────────────────────────────────────────────

const POR_VALIDAR = /por validar/i;

export const EquiposDiagnosticoSection: FC<SectionProps<EquiposDiagnosticoData>> = ({ data, editable, onChange }) => {
  const filas = arr(data.equipos);
  const set = (next: Partial<EquiposDiagnosticoData>) => onChange?.({ ...data, ...next });
  if (!editable && !filas.length) return null;
  const celda = (i: number, campo: keyof EquipoDiagnostico, placeholder: string, className?: string) => (
    <Editable as="span" className={className} editable={editable} value={filas[i][campo] ?? ""} placeholder={placeholder}
      onCommit={(v) => set({ equipos: replaceAt(filas, i, { ...filas[i], [campo]: v }) })} />
  );
  return (
    <>
      <Intro value={data.intro} editable={editable} onCommit={(v) => set({ intro: v })} placeholder="Una frase que enmarca los equipos (opcional)…" />
      <div className="stl-props-scroll">
        <table className="stl-props stl-equipos">
          <thead>
            <tr>
              <th>Equipo</th>
              <th>Personas</th>
              <th>Rol en el proyecto</th>
              <th>Asiento o licencia</th>
              {editable && <th className="stl-props-actions" aria-label="Acciones" />}
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={i}>
                <td>{celda(i, "equipo", "El equipo o el área…", "stl-accion-titulo")}</td>
                <td>{celda(i, "personas", "Quiénes…")}</td>
                <td>{celda(i, "rol", "Qué hace en el proyecto…")}</td>
                <td className={POR_VALIDAR.test(f.licencia ?? "") ? "stl-por-validar" : undefined}>{celda(i, "licencia", "Por validar")}</td>
                {editable && (
                  <td className="stl-props-actions">
                    <RemoveBtn onClick={() => set({ equipos: removeAt(filas, i) })} title="Quitar este equipo" />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editable && (
        <AddBtn label="Agregar equipo" onClick={() => set({ equipos: appendItem(filas, { equipo: "", personas: "", rol: "", licencia: "" }) })} />
      )}
    </>
  );
};

// ── Alcance acordado ─────────────────────────────────────────────────────────────────────────

function ItemsDeAlcance({
  items,
  editable,
  onChange,
}: {
  items: ItemDeAlcance[];
  editable?: boolean;
  onChange: (items: ItemDeAlcance[]) => void;
}) {
  return (
    <ul className="stl-alcance-items">
      {items.map((it, i) => (
        <li key={i} className="stl-item">
          {editable && <RemoveBtn onClick={() => onChange(removeAt(items, i))} title="Quitar este ítem" />}
          <Editable as="span" className="stl-codigo stl-alcance-ac" editable={editable} value={it.acciones ?? ""} placeholder="AC-01"
            onCommit={(v) => onChange(replaceAt(items, i, { ...it, acciones: v }))} />{" "}
          <Editable as="span" editable={editable} value={it.texto ?? ""} placeholder="Lo que incluye…"
            onCommit={(v) => onChange(replaceAt(items, i, { ...it, texto: v }))} />
        </li>
      ))}
      {editable && (
        <li>
          <AddBtn label="Agregar ítem" onClick={() => onChange(appendItem(items, { texto: "", acciones: "" }))} />
        </li>
      )}
    </ul>
  );
}

export const AlcanceDiagnosticoSection: FC<SectionProps<AlcanceDiagnosticoData>> = ({ data, editable, onChange }) => {
  const grupos = arr(data.grupos);
  const fuera = arr(data.fuera);
  const set = (next: Partial<AlcanceDiagnosticoData>) => onChange?.({ ...data, ...next });
  if (!editable && !grupos.length && !fuera.length) return null;
  return (
    <>
      <Intro value={data.intro} editable={editable} onCommit={(v) => set({ intro: v })} placeholder="Una frase que enmarca el alcance (opcional)…" />
      {(grupos.length > 0 || editable) && <h3 className="stl-obj-titulo">Incluido</h3>}
      <div className="stl-grid stl-grid-2 stl-alcance">
        {grupos.map((g, i) => (
          <div key={i} className="stl-item stl-card">
            {editable && <RemoveBtn onClick={() => set({ grupos: removeAt(grupos, i) })} title="Quitar este grupo" />}
            <Editable as="h3" className="stl-card-title" editable={editable} value={g.titulo ?? ""} placeholder="El hub o el frente…"
              onCommit={(v) => set({ grupos: replaceAt(grupos, i, { ...g, titulo: v }) })} />
            <ItemsDeAlcance items={arr(g.items)} editable={editable}
              onChange={(items) => set({ grupos: replaceAt(grupos, i, { ...g, items }) })} />
          </div>
        ))}
      </div>
      {editable && <AddBtn label="Agregar grupo" onClick={() => set({ grupos: appendItem(grupos, { titulo: "", items: [] }) })} />}
      {(fuera.length > 0 || editable) && (
        <div className="stl-alcance-fuera">
          <h3 className="stl-obj-titulo">Fuera de este alcance</h3>
          <ItemsDeAlcance items={fuera} editable={editable} onChange={(items) => set({ fuera: items })} />
        </div>
      )}
    </>
  );
};
