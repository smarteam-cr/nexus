"use client";

/**
 * components/landing/sections-planificacion.tsx — las secciones de la Planificación práctica (2026-10-02).
 *
 * La Planificación es lo que va a quedar configurado en HubSpot. Caroline la presenta al cliente como
 * la arquitectura armada por fuera, antes de configurar:
 *
 *   · `procesos_futuro`      — cómo van a funcionar los procesos, paso a paso (solo lo que se hará).
 *   · `ciclo_vida_tabla`     — las etapas del ciclo de vida: cuándo entra un contacto y qué lo mueve.
 *   · `propiedades_objeto`   — las propiedades por objeto, una pestaña por objeto.
 *   · `pipelines_horizontal` — los pipelines de leads, ventas y servicio, con las etapas de izquierda a derecha.
 *   · `automatizaciones`     — qué la dispara, qué hace, qué resuelve.
 *   · `conversaciones`       — mensajería instantánea: quién responde (persona, chatbot o agente de IA).
 *
 * Todo lo que se configura dice de dónde sale: acordado en una reunión, propuesta de Smarteam o
 * supuesto (lib/planificacion/origen.ts). Lo viejo se lee con los `adoptar*` de
 * lib/planificacion/secciones.ts y se guarda con la forma nueva al primer cambio.
 *
 * Sin scrollers ni nada que dependa del viewport: el documento se exporta a PDF. Las etapas de un
 * pipeline se ENCOGEN para entrar en una fila (como el Gantt), y en pantallas angostas se apilan.
 */
import { useState, type FC } from "react";
import type { SectionProps } from "./types";
import { Editable, InlineCheck, InlineSelect, RemoveBtn, AddBtn, replaceAt, removeAt, appendItem } from "./inline";
import { ConIntro } from "./partes";
import { partesDe } from "@/lib/landing/partes";
import { ORIGENES, normalizarOrigen, etiquetaDeOrigen } from "@/lib/planificacion/origen";
import {
  adoptarProcesos,
  adoptarCicloDeVida,
  adoptarPipelines,
  adoptarAutomatizaciones,
  adoptarConversaciones,
  listaDeRequisitos,
  mover,
  CAMBIOS_DE_ETAPA,
  TIPOS_DE_PIPELINE,
  CIERRES_DE_ETAPA,
  QUIEN_RESPONDE,
  ESTADOS_DEL_LEAD_DE_SIEMPRE,
  type EstadoDelLead,
  type ProcesosFuturoData,
  type ProcesoFuturo,
  type PasoDeProceso,
  type CicloDeVidaData,
  type EtapaDeCiclo,
  type PipelinesData,
  type Pipeline,
  type EtapaDePipeline,
  type AutomatizacionesData,
  type Automatizacion,
  type ConversacionesData,
  type Conversacion,
} from "@/lib/planificacion/secciones";
import {
  TIPOS_DE_PROPIEDAD,
  ESTADOS_DE_PROPIEDAD,
  objetosDe,
  normalizarObjeto,
  nuevoIdDeFila,
  tocadaPorUnaPersona,
  gruposDe,
  agregarGrupo,
  renombrarGrupo,
  moverGrupo,
  quitarGrupo,
  opcionesDe,
  fichaDe,
  plantillaDeImportacion,
  columnasDeImportacion,
  type FilaPropiedad,
  type PropiedadesData,
} from "@/lib/planificacion/propiedades";
import { leerPlantilla, sumarImportadas } from "@/lib/planificacion/importar";
import { plantillaExcel } from "@/lib/planificacion/plantilla-excel";

/** «Contacto» → «contactos», para los textos que hablan de varios registros. */
const enPlural = (objeto: string) =>
  ({ Contacto: "contactos", Empresa: "empresas", Lead: "leads", Negocio: "negocios", Ticket: "tickets" } as Record<string, string>)[objeto] ?? objeto;

/* ── Piezas comunes ─────────────────────────────────────────────────────────── */

/** El chip de origen. En edición, un desplegable; en lectura, nada si no se sabe. */
export function OrigenChip({ value, editable, onCommit }: { value?: string; editable?: boolean; onCommit: (v: string) => void }) {
  const o = normalizarOrigen(value);
  if (editable) {
    return (
      <span className={`stl-origen stl-origen--${o || "vacio"}`}>
        <InlineSelect value={o} options={ORIGENES} editable onCommit={onCommit} placeholder="Origen" ariaLabel="De dónde sale" />
      </span>
    );
  }
  if (!o) return null;
  return <span className={`stl-origen stl-origen--${o}`}>{etiquetaDeOrigen(o)}</span>;
}

/** Flechas ‹ › para cambiar de lugar un elemento. Solo en edición. */
export function Mover({ onIzq, onDer, puedeIzq, puedeDer, rotulo }: { onIzq: () => void; onDer: () => void; puedeIzq: boolean; puedeDer: boolean; rotulo: string }) {
  return (
    <span className="stl-plan-mover">
      <button type="button" onClick={onIzq} disabled={!puedeIzq} aria-label={`Mover ${rotulo} antes`} title="Mover antes">‹</button>
      <button type="button" onClick={onDer} disabled={!puedeDer} aria-label={`Mover ${rotulo} después`} title="Mover después">›</button>
    </span>
  );
}

/** Una fila «rótulo · valor» de una tarjeta. En lectura, una vacía no se pinta. */
export function Campo({ rotulo, value, editable, placeholder, onCommit, aviso }: { rotulo: string; value?: string; editable?: boolean; placeholder: string; onCommit: (v: string) => void; aviso?: boolean }) {
  if (!editable && !(value ?? "").trim()) return null;
  return (
    <>
      <dt>{rotulo}</dt>
      <dd className={aviso && (value ?? "").trim() ? "stl-plan-falta" : undefined}>
        <Editable as="span" editable={editable} value={value ?? ""} placeholder={placeholder} onCommit={onCommit} />
      </dd>
    </>
  );
}

/* ── Procesos: cómo van a funcionar ─────────────────────────────────────────── */

export const ProcesosFuturoSection: FC<SectionProps<ProcesosFuturoData>> = ({ data, editable, onChange }) => {
  const d = adoptarProcesos(data);
  const procesos = d.procesos;
  const set = (next: Partial<ProcesosFuturoData>) => onChange?.({ ...partesDe(data), ...d, ...next });
  const setProceso = (i: number, patch: Partial<ProcesoFuturo>) => set({ procesos: replaceAt(procesos, i, { ...procesos[i], ...patch }) });
  if (!editable && !procesos.length) return null;
  return (
    <ConIntro data={{ ...(data as object), intro: d.intro }} editable={editable} onCambios={(c) => set(c as unknown as Partial<ProcesosFuturoData>)} placeholder="Una frase que enmarca los procesos…">
      {procesos.map((p, i) => {
        const pasos = p.pasos;
        const setPaso = (j: number, patch: Partial<PasoDeProceso>) => setProceso(i, { pasos: replaceAt(pasos, j, { ...pasos[j], ...patch }) });
        return (
          <div key={i} className="stl-plan-bloque stl-item">
            {editable && <RemoveBtn onClick={() => set({ procesos: removeAt(procesos, i) })} title="Quitar este proceso" />}
            <div className="stl-plan-bloque-h">
              <Editable as="span" className="stl-plan-nombre" editable={editable} value={p.nombre} placeholder="Nombre del proceso…" onCommit={(v) => setProceso(i, { nombre: v })} />
              {(editable || p.fuente) && (
                <Editable as="span" className="stl-plan-fuente" editable={editable} value={p.fuente ?? ""} placeholder="Reuniones que lo respaldan…" onCommit={(v) => setProceso(i, { fuente: v })} />
              )}
            </div>
            {(editable || p.resumen) && (
              <Editable as="p" className="stl-plan-sub" editable={editable} value={p.resumen ?? ""} placeholder="Cómo va a funcionar, en media línea…" onCommit={(v) => setProceso(i, { resumen: v })} />
            )}
            {!pasos.length && p.comoSera && (
              <Editable as="p" className="stl-plan-legado" editable={editable} value={p.comoSera} onCommit={(v) => setProceso(i, { comoSera: v })} />
            )}
            {pasos.length > 0 && (
              <ol className="stl-plan-flujo">
                {pasos.map((s, j) => (
                  <li key={j} className="stl-plan-paso">
                    <span className="stl-plan-num" aria-hidden="true">{j + 1}</span>
                    <Editable as="span" className="stl-plan-paso-t" editable={editable} value={s.paso} placeholder="Qué pasa…" onCommit={(v) => setPaso(j, { paso: v })} />
                    {(editable || s.detalle) && (
                      <Editable as="span" className="stl-plan-paso-d" editable={editable} value={s.detalle ?? ""} placeholder="Detalle (opcional)…" onCommit={(v) => setPaso(j, { detalle: v })} />
                    )}
                    <span className="stl-plan-pie">
                      <OrigenChip value={s.origen} editable={editable} onCommit={(v) => setPaso(j, { origen: v })} />
                      {editable && (
                        <>
                          <Mover rotulo="el paso" puedeIzq={j > 0} puedeDer={j < pasos.length - 1}
                            onIzq={() => setProceso(i, { pasos: mover(pasos, j, -1) })} onDer={() => setProceso(i, { pasos: mover(pasos, j, 1) })} />
                          <RemoveBtn onClick={() => setProceso(i, { pasos: removeAt(pasos, j) })} title="Quitar este paso" />
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            )}
            {editable && <AddBtn label="Agregar paso" onClick={() => setProceso(i, { pasos: appendItem(pasos, { paso: "", detalle: "", origen: "" }) })} />}
          </div>
        );
      })}
      {editable && <AddBtn label="Agregar proceso" onClick={() => set({ procesos: appendItem(procesos, { nombre: "", resumen: "", fuente: "", pasos: [] }) })} />}
    </ConIntro>
  );
};

/* ── Etapas del ciclo de vida ───────────────────────────────────────────────── */

export const CicloDeVidaSection: FC<SectionProps<CicloDeVidaData>> = ({ data, editable, onChange }) => {
  const d = adoptarCicloDeVida(data);
  const etapas = d.etapas;
  // La forma nueva se guarda limpia: sin los `items` de la prosa vieja.
  const estados = d.estadosLead ?? [];
  const set = (next: Partial<CicloDeVidaData>) => onChange?.({ ...partesDe(data), intro: d.intro, etapas: d.etapas, estadosLead: estados, ...next });
  const setEtapa = (i: number, patch: Partial<EtapaDeCiclo>) => set({ etapas: replaceAt(etapas, i, { ...etapas[i], ...patch }) });
  const setEstado = (i: number, patch: Partial<EstadoDelLead>) => set({ estadosLead: replaceAt(estados, i, { ...estados[i], ...patch }) });
  if (!editable && !etapas.length && !estados.length) return null;
  const celda = (i: number, campo: keyof EtapaDeCiclo, placeholder: string, className?: string) => (
    <Editable as="span" className={className} editable={editable} value={etapas[i][campo] ?? ""} placeholder={placeholder} onCommit={(v) => setEtapa(i, { [campo]: v })} />
  );
  return (
    <ConIntro data={{ ...(data as object), intro: d.intro }} editable={editable} onCambios={(c) => set(c as unknown as Partial<CicloDeVidaData>)} placeholder="De dónde parte: cuántas etapas tiene hoy el portal y cuántas se proponen…">
      <div className="stl-props-scroll">
        <table className="stl-props stl-plan-tabla">
          <thead>
            <tr>
              <th>Etapa</th>
              <th>Entra cuando</th>
              <th>Lo mueve</th>
              <th>Cambio</th>
              <th>Origen</th>
              {editable && <th className="stl-props-actions" aria-label="Acciones" />}
            </tr>
          </thead>
          <tbody>
            {etapas.map((e, i) => (
              <tr key={i}>
                <td>{celda(i, "etapa", "Lead", "stl-accion-titulo")}</td>
                <td>{celda(i, "entraCuando", "Cuándo entra un contacto…")}</td>
                <td>{celda(i, "laMueve", "Una persona o una automatización…")}</td>
                <td><InlineSelect value={e.cambio ?? ""} options={CAMBIOS_DE_ETAPA} editable={editable} onCommit={(v) => setEtapa(i, { cambio: v })} ariaLabel="Qué cambia en esta etapa" /></td>
                <td><OrigenChip value={e.origen} editable={editable} onCommit={(v) => setEtapa(i, { origen: v })} /></td>
                {editable && (
                  <td className="stl-props-actions">
                    <RemoveBtn onClick={() => set({ etapas: removeAt(etapas, i) })} title="Quitar esta etapa" />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editable && <AddBtn label="Agregar etapa" onClick={() => set({ etapas: appendItem(etapas, { etapa: "", entraCuando: "", laMueve: "", cambio: "nueva", origen: "" }) })} />}

      {/* 2026-10-25 — el estado del lead, al lado del ciclo de vida como en el Brief. */}
      {(editable || estados.length > 0) && <h3 className="stl-plan-objeto">Estado del lead</h3>}
      {estados.length > 0 && (
        <div className="stl-props-scroll">
          <table className="stl-props stl-plan-tabla">
            <thead>
              <tr>
                <th>Estado</th>
                <th>Qué significa</th>
                <th>Origen</th>
                {editable && <th className="stl-props-actions" aria-label="Acciones" />}
              </tr>
            </thead>
            <tbody>
              {estados.map((e, i) => (
                <tr key={i}>
                  <td><Editable as="span" className="stl-accion-titulo" editable={editable} value={e.estado} placeholder="Nuevo" onCommit={(v) => setEstado(i, { estado: v })} /></td>
                  <td><Editable as="span" editable={editable} value={e.significa ?? ""} placeholder="Cuándo un lead está en este estado…" onCommit={(v) => setEstado(i, { significa: v })} /></td>
                  <td><OrigenChip value={e.origen} editable={editable} onCommit={(v) => setEstado(i, { origen: v })} /></td>
                  {editable && (
                    <td className="stl-props-actions"><RemoveBtn onClick={() => set({ estadosLead: removeAt(estados, i) })} title="Quitar este estado" /></td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editable && (
        <div className="stl-plan-acciones">
          <AddBtn label="Agregar estado" onClick={() => set({ estadosLead: appendItem(estados, { estado: "", significa: "", origen: "" }) })} />
          {!estados.length && (
            <button type="button" className="stl-plan-mini" onClick={() => set({ estadosLead: ESTADOS_DEL_LEAD_DE_SIEMPRE.map((estado) => ({ estado, significa: "", origen: "" })) })}>
              Empezar con los estados de siempre
            </button>
          )}
        </div>
      )}
    </ConIntro>
  );
};

/* ── Propiedades por objeto ─────────────────────────────────────────────────── */

/* 2026-10-25 — con lo que pide el Brief de implementación: las propiedades de cada objeto van POR GRUPO
   (con orden), cada una dice si se ve en la ficha, la ficha se previsualiza, se pega una plantilla de
   Excel o la pestaña del Brief, y la plantilla para importar la base sale sola de la tabla. */

/** Descarga la plantilla de importación de un objeto, en Excel; si el Excel no se puede armar, en CSV. Solo en el navegador. */
async function descargarPlantilla(data: PropiedadesData, objeto: string) {
  const nombre = `plantilla-de-importacion-${objeto.toLowerCase().replace(/\s+/g, "-")}`;
  let blob: Blob;
  let extension = "xlsx";
  try {
    const buffer = await plantillaExcel(columnasDeImportacion(data, objeto), `Importar ${enPlural(objeto)}`);
    blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  } catch {
    blob = new Blob([plantillaDeImportacion(data, objeto)], { type: "text/csv;charset=utf-8" });
    extension = "csv";
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nombre}.${extension}`;
  a.click();
  URL.revokeObjectURL(url);
}

const nombreDeGrupoNuevo = (existentes: string[]) => {
  let n = 1;
  while (existentes.some((g) => g.toLowerCase() === (n === 1 ? "grupo nuevo" : `grupo nuevo ${n}`))) n++;
  return n === 1 ? "Grupo nuevo" : `Grupo nuevo ${n}`;
};

export const PropiedadesObjetoSection: FC<SectionProps<PropiedadesData>> = ({ data, ctx, editable, onChange }) => {
  const filas = Array.isArray(data?.filas) ? data.filas : [];
  const d: PropiedadesData = { ...data, filas };
  const set = (next: PropiedadesData) => onChange?.({ ...data, ...next });
  // Una fila tocada por una persona pasa a ser suya: regenerar ya no la reemplaza (lib/planificacion/propiedades.ts).
  const setFila = (i: number, patch: Partial<FilaPropiedad>) => set({ ...d, filas: replaceAt(filas, i, tocadaPorUnaPersona({ ...filas[i], ...patch })) });
  const objetos = objetosDe(filas, !!editable);
  const [activo, setActivo] = useState<string>(objetos[0] ?? "Contacto");
  const [pegado, setPegado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  if (!editable && !filas.length) return null;

  // En el PDF no hay pestañas: salen todos los objetos, uno debajo del otro.
  const visibles = ctx.pdfMode ? objetos : objetos.includes(activo) ? [activo] : objetos.slice(0, 1);
  const columnas = editable ? 9 : 8;

  const importar = (objeto: string) => {
    const r = leerPlantilla(pegado ?? "", objeto);
    if (!r.filas.length) {
      setAviso("No encontré propiedades. Copia también la fila de títulos (Propiedad, Tipo…) o, del Brief, desde «TARJETA DE VISUALIZACIÓN» hasta las opciones.");
      return;
    }
    const { data: nueva, sumadas, repetidas } = sumarImportadas(d, r.filas);
    set(nueva);
    setPegado(null);
    setAviso(
      `Se sumaron ${sumadas} ${sumadas === 1 ? "propiedad" : "propiedades"}` +
        (repetidas ? `. ${repetidas} ya las había escrito una persona y quedaron como estaban.` : "."),
    );
  };

  const fila = (f: FilaPropiedad, i: number, grupos: string[]) => {
    const opciones = opcionesDe(f.opciones);
    return (
      <tr key={f.id ?? i}>
        <td>
          <Editable as="span" className="stl-accion-titulo" editable={editable} value={f.etiqueta || (editable ? "" : f.campo)} placeholder="Etiqueta…" onCommit={(v) => setFila(i, { etiqueta: v })} />
          <div className="stl-plan-meta">
            <InlineSelect value={f.estado ?? ""} options={ESTADOS_DE_PROPIEDAD} editable={editable} onCommit={(v) => setFila(i, { estado: v })} ariaLabel="Si es nueva, existente, se ajusta o viene con HubSpot" placeholder="Estado" />
            {editable && (
              <InlineSelect value={f.grupo ?? ""} options={grupos.map((g) => ({ value: g, label: g }))} editable onCommit={(v) => setFila(i, { grupo: v })} ariaLabel="Grupo de propiedades" placeholder="Sin grupo" />
            )}
          </div>
        </td>
        <td><Editable as="span" className="stl-props-campo" editable={editable} value={f.campo} placeholder="nombre_interno" onCommit={(v) => setFila(i, { campo: v })} /></td>
        <td><InlineSelect value={f.tipo} options={TIPOS_DE_PROPIEDAD} editable={editable} onCommit={(v) => setFila(i, { tipo: v })} ariaLabel="Tipo de campo" /></td>
        <td>
          {!editable && opciones.length > 1 ? (
            <span className="stl-plan-opciones">{opciones.map((o) => <span key={o}>{o}</span>)}</span>
          ) : (
            <Editable as="span" editable={editable} value={f.opciones ?? ""} placeholder="Opción · Opción" onCommit={(v) => setFila(i, { opciones: v })} />
          )}
        </td>
        <td className="stl-props-mid"><InlineCheck value={f.obligatoria ?? ""} editable={editable} onCommit={(v) => setFila(i, { obligatoria: v })} ariaLabel="Obligatoria" /></td>
        <td className="stl-props-mid"><InlineCheck value={f.enFicha ?? ""} editable={editable} onCommit={(v) => setFila(i, { enFicha: v })} ariaLabel="Se ve en la ficha" /></td>
        <td><Editable as="span" className="stl-props-desc" editable={editable} value={f.uso ?? ""} placeholder="Para qué existe…" onCommit={(v) => setFila(i, { uso: v })} /></td>
        <td>
          <OrigenChip value={f.origen} editable={editable} onCommit={(v) => setFila(i, { origen: v })} />
          {(editable || f.fuente) && (
            <Editable as="div" className="stl-plan-fuente" editable={editable} value={f.fuente ?? ""} placeholder="Reunión…" onCommit={(v) => setFila(i, { fuente: v })} />
          )}
        </td>
        {editable && (
          <td className="stl-props-actions">
            <RemoveBtn onClick={() => set({ ...d, filas: removeAt(filas, i) })} title="Quitar esta propiedad" />
          </td>
        )}
      </tr>
    );
  };

  const tabla = (objeto: string) => {
    const grupos = gruposDe(d, objeto);
    const nombres = grupos.filter(Boolean);
    const delGrupo = (g: string) =>
      filas.map((f, i) => ({ f, i })).filter(({ f }) => normalizarObjeto(f.objeto) === objeto && (f.grupo ?? "").trim().toLowerCase() === g.toLowerCase());
    const nuevaFila = (grupo: string): FilaPropiedad => ({
      id: nuevoIdDeFila(), autor: "persona", objeto, grupo, etiqueta: "", campo: "", tipo: "",
      opciones: "", obligatoria: "no", enFicha: "no", estado: "nueva", uso: "", origen: "", fuente: "",
    });
    const ficha = fichaDe(d, objeto);
    const conColumnas = !ctx.pdfMode && filas.some((f) => normalizarObjeto(f.objeto) === objeto) && columnasDeImportacion(d, objeto).length > 0;
    return (
      <div key={objeto}>
        {ctx.pdfMode && <h3 className="stl-plan-objeto">{objeto}</h3>}
        <div className="stl-props-scroll">
          <table className="stl-props stl-plan-tabla">
            <thead>
              <tr>
                <th>Propiedad</th>
                <th>Nombre interno</th>
                <th>Tipo</th>
                <th>Opciones</th>
                <th className="stl-props-mid">Oblig.</th>
                <th className="stl-props-mid">En la ficha</th>
                <th>Para qué</th>
                <th>Origen</th>
                {editable && <th className="stl-props-actions" aria-label="Acciones" />}
              </tr>
            </thead>
            {grupos.map((g) => {
              const lugar = nombres.indexOf(g);
              return (
                <tbody key={g || "__sin-grupo"}>
                  {(g || nombres.length > 0) && (
                    <tr className="stl-plan-grupo-fila">
                      <th colSpan={columnas} scope="colgroup">
                        <span className="stl-plan-grupo-h">
                          {g ? (
                            <Editable as="span" className="stl-plan-grupo-n" editable={editable} value={g} placeholder="Nombre del grupo…" onCommit={(v) => set(renombrarGrupo(d, objeto, g, v))} />
                          ) : (
                            <span className="stl-plan-grupo-n">Sin grupo</span>
                          )}
                          {editable && g && (
                            <>
                              <Mover rotulo="el grupo" puedeIzq={lugar > 0} puedeDer={lugar < nombres.length - 1}
                                onIzq={() => set(moverGrupo(d, objeto, g, -1))} onDer={() => set(moverGrupo(d, objeto, g, 1))} />
                              <button type="button" className="stl-plan-mini" onClick={() => set({ ...d, filas: [...filas, nuevaFila(g)] })}>+ Propiedad</button>
                              <RemoveBtn onClick={() => set(quitarGrupo(d, objeto, g))} title="Quitar el grupo (sus propiedades quedan sin grupo)" />
                            </>
                          )}
                        </span>
                      </th>
                    </tr>
                  )}
                  {delGrupo(g).map(({ f, i }) => fila(f, i, nombres))}
                </tbody>
              );
            })}
          </table>
        </div>
        {editable && (
          <div className="stl-plan-acciones">
            <AddBtn label={`Agregar propiedad de ${objeto}`} onClick={() => set({ ...d, filas: appendItem(filas, nuevaFila("")) })} />
            <AddBtn label="Agregar grupo" onClick={() => set(agregarGrupo(d, objeto, nombreDeGrupoNuevo(nombres)))} />
            <button type="button" className="stl-add" onClick={() => { setAviso(null); setPegado(pegado === null ? "" : null); }}>
              Pegar desde Excel o el Brief
            </button>
          </div>
        )}
        {editable && pegado !== null && (
          <div className="stl-plan-pegar">
            <label className="stl-plan-pegar-l" htmlFor={`pegar-${objeto}`}>
              Pega las celdas que copiaste de Excel, de Google Sheets o de la pestaña de propiedades del Brief. Lo que no diga de qué objeto es se suma a {objeto}.
            </label>
            <textarea id={`pegar-${objeto}`} className="stl-plan-pegar-t" rows={6} value={pegado} onChange={(e) => setPegado(e.target.value)} />
            <div className="stl-plan-acciones">
              <button type="button" className="stl-plan-mini stl-plan-mini--fuerte" disabled={!pegado.trim()} onClick={() => importar(objeto)}>Sumar las propiedades</button>
              <button type="button" className="stl-plan-mini" onClick={() => setPegado(null)}>Cancelar</button>
            </div>
          </div>
        )}
        {editable && aviso && <p className="stl-plan-aviso" role="status">{aviso}</p>}
        {conColumnas && (
          <div className="stl-plan-acciones">
            <button type="button" className="stl-plan-mini" onClick={() => void descargarPlantilla(d, objeto)}>
              Descargar la plantilla para importar {enPlural(objeto)}
            </button>
          </div>
        )}
        {ficha.length > 0 ? (
          <div className="stl-plan-ficha">
            <div className="stl-plan-ficha-t">Así va a quedar la ficha de {objeto} en HubSpot</div>
            <div className="stl-plan-ficha-g">
              {ficha.map((g, k) => (
                <div key={`${g.grupo}-${k}`} className="stl-plan-ficha-card">
                  <div className="stl-plan-ficha-n">{g.grupo || "Sin grupo"}</div>
                  <ul>{g.propiedades.map((p, j) => <li key={`${p}-${j}`}>{p}</li>)}</ul>
                </div>
              ))}
            </div>
          </div>
        ) : (
          editable && filas.some((f) => normalizarObjeto(f.objeto) === objeto) && (
            <p className="stl-plan-aviso">Marca «En la ficha» en las propiedades que el equipo tiene que ver al abrir un registro: aquí se arma cómo va a quedar.</p>
          )
        )}
      </div>
    );
  };

  return (
    <ConIntro data={{ ...(data as object), intro: data?.intro }} editable={editable} onCambios={(c) => set({ ...d, ...(c as unknown as Partial<PropiedadesData>) })} placeholder="Una frase que enmarca las propiedades…">
      {!ctx.pdfMode && objetos.length > 0 && (
        <div className="stl-plan-tabs" role="tablist" aria-label="Objetos">
          {objetos.map((o) => {
            const n = filas.filter((f) => normalizarObjeto(f.objeto) === o).length;
            return (
              <button key={o} type="button" role="tab" aria-selected={visibles[0] === o} className="stl-plan-tab" onClick={() => { setActivo(o); setPegado(null); setAviso(null); }}>
                {o} <span className="stl-plan-tab-n">{n}</span>
              </button>
            );
          })}
        </div>
      )}
      {visibles.map(tabla)}
    </ConIntro>
  );
};

/* ── Pipelines (horizontales) ───────────────────────────────────────────────── */

const etiquetaDe = (opciones: readonly { value: string; label: string }[], v?: string) => opciones.find((o) => o.value === v)?.label ?? "";

export const PipelinesSection: FC<SectionProps<PipelinesData>> = ({ data, editable, onChange }) => {
  const d = adoptarPipelines(data);
  const pipelines = d.pipelines;
  // La forma nueva se guarda limpia: sin los `procesos` que vinieron de Ejecución.
  const set = (next: Partial<PipelinesData>) => onChange?.({ ...partesDe(data), intro: d.intro, pipelines: d.pipelines, ...next });
  const setPipe = (i: number, patch: Partial<Pipeline>) => set({ pipelines: replaceAt(pipelines, i, { ...pipelines[i], ...patch }) });
  if (!editable && !pipelines.length) return null;
  return (
    <ConIntro data={{ ...(data as object), intro: d.intro }} editable={editable} onCambios={(c) => set(c as unknown as Partial<PipelinesData>)} placeholder="Una frase que enmarca los pipelines…">
      {pipelines.map((p, i) => {
        const etapas = p.etapas;
        const setEtapa = (j: number, patch: Partial<EtapaDePipeline>) => setPipe(i, { etapas: replaceAt(etapas, j, { ...etapas[j], ...patch }) });
        return (
          <div key={i} className="stl-plan-bloque stl-item">
            {editable && <RemoveBtn onClick={() => set({ pipelines: removeAt(pipelines, i) })} title="Quitar este pipeline" />}
            <div className="stl-plan-bloque-h">
              <span className="stl-plan-tipo">
                {editable ? (
                  <InlineSelect value={p.tipo} options={TIPOS_DE_PIPELINE} editable onCommit={(v) => setPipe(i, { tipo: v })} ariaLabel="Tipo de pipeline" />
                ) : (
                  etiquetaDe(TIPOS_DE_PIPELINE, p.tipo)
                )}
              </span>
              <Editable as="span" className="stl-plan-nombre" editable={editable} value={p.nombre} placeholder="Nombre del pipeline…" onCommit={(v) => setPipe(i, { nombre: v })} />
              {(editable || p.objeto) && (
                <Editable as="span" className="stl-plan-fuente" editable={editable} value={p.objeto ?? ""} placeholder="Objeto (Lead, Negocio, Ticket)…" onCommit={(v) => setPipe(i, { objeto: v })} />
              )}
              <OrigenChip value={p.origen} editable={editable} onCommit={(v) => setPipe(i, { origen: v })} />
            </div>
            {(editable || p.nota) && (
              <Editable as="p" className="stl-plan-sub" editable={editable} value={p.nota ?? ""} placeholder="Una línea de contexto (opcional)…" onCommit={(v) => setPipe(i, { nota: v })} />
            )}
            {etapas.length > 0 && (
              <ol className="stl-plan-etapas">
                {etapas.map((e, j) => {
                  const reqs = listaDeRequisitos(e.requisitos);
                  return (
                    <li key={j} className={`stl-plan-etapa${e.cierre ? ` stl-plan-etapa--${e.cierre}` : ""}${normalizarOrigen(e.origen) === "supuesto" ? " stl-plan-etapa--supuesto" : ""}`}>
                      <Editable as="span" className="stl-plan-etapa-t" editable={editable} value={e.etapa} placeholder="Etapa…" onCommit={(v) => setEtapa(j, { etapa: v })} />
                      {(editable || e.entraCuando) && (
                        <Editable as="span" className="stl-plan-etapa-d" editable={editable} value={e.entraCuando ?? ""} placeholder="Entra cuando…" onCommit={(v) => setEtapa(j, { entraCuando: v })} />
                      )}
                      {editable ? (
                        <Editable as="span" className="stl-plan-req-edit" editable value={e.requisitos ?? ""} placeholder="Para avanzar: propiedades, separadas por comas" onCommit={(v) => setEtapa(j, { requisitos: v })} />
                      ) : (
                        reqs.length > 0 && (
                          <span className="stl-plan-req">
                            {reqs.map((r) => <span key={r}>{r}</span>)}
                          </span>
                        )
                      )}
                      {(editable || e.automatizacion) && (
                        <Editable as="span" className="stl-plan-etapa-auto" editable={editable} value={e.automatizacion ?? ""} placeholder="Lo que pasa solo al entrar (opcional)…" onCommit={(v) => setEtapa(j, { automatizacion: v })} />
                      )}
                      <span className="stl-plan-pie">
                        {editable && <InlineSelect value={e.cierre ?? ""} options={CIERRES_DE_ETAPA} editable onCommit={(v) => setEtapa(j, { cierre: v })} ariaLabel="Si la etapa cierra el pipeline" />}
                        <OrigenChip value={e.origen} editable={editable} onCommit={(v) => setEtapa(j, { origen: v })} />
                        {editable && (
                          <>
                            <Mover rotulo="la etapa" puedeIzq={j > 0} puedeDer={j < etapas.length - 1}
                              onIzq={() => setPipe(i, { etapas: mover(etapas, j, -1) })} onDer={() => setPipe(i, { etapas: mover(etapas, j, 1) })} />
                            <RemoveBtn onClick={() => setPipe(i, { etapas: removeAt(etapas, j) })} title="Quitar esta etapa" />
                          </>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
            {editable && <AddBtn label="Agregar etapa" onClick={() => setPipe(i, { etapas: appendItem(etapas, { etapa: "", entraCuando: "", requisitos: "", cierre: "", origen: "" }) })} />}
          </div>
        );
      })}
      {editable && <AddBtn label="Agregar pipeline" onClick={() => set({ pipelines: appendItem(pipelines, { tipo: "ventas", nombre: "", objeto: "", nota: "", origen: "", etapas: [] }) })} />}
    </ConIntro>
  );
};

/* ── Automatizaciones ───────────────────────────────────────────────────────── */

export const AutomatizacionesSection: FC<SectionProps<AutomatizacionesData>> = ({ data, editable, onChange }) => {
  const d = adoptarAutomatizaciones(data);
  const items = d.items;
  const set = (next: Partial<AutomatizacionesData>) => onChange?.({ ...partesDe(data), intro: d.intro, items: d.items, ...next });
  const setItem = (i: number, patch: Partial<Automatizacion>) => set({ items: replaceAt(items, i, { ...items[i], ...patch }) });
  if (!editable && !items.length) return null;
  return (
    <ConIntro data={{ ...(data as object), intro: d.intro }} editable={editable} onCambios={(c) => set(c as unknown as Partial<AutomatizacionesData>)} placeholder="Una frase que enmarca las automatizaciones…">
      <div className="stl-plan-cards">
        {items.map((a, i) => (
          <div key={i} className={`stl-plan-card stl-item${(a.falta ?? "").trim() || normalizarOrigen(a.origen) === "supuesto" ? " stl-plan-card--aviso" : ""}`}>
            {editable && <RemoveBtn onClick={() => set({ items: removeAt(items, i) })} title="Quitar esta automatización" />}
            <div className="stl-plan-card-h">
              <div>
                <Editable as="div" className="stl-plan-card-t" editable={editable} value={a.nombre} placeholder="Nombre de la automatización…" onCommit={(v) => setItem(i, { nombre: v })} />
                {(editable || a.donde) && (
                  <Editable as="div" className="stl-plan-fuente" editable={editable} value={a.donde ?? ""} placeholder="Objeto · Hub…" onCommit={(v) => setItem(i, { donde: v })} />
                )}
              </div>
              <OrigenChip value={a.origen} editable={editable} onCommit={(v) => setItem(i, { origen: v })} />
            </div>
            <dl className="stl-plan-campos">
              <Campo rotulo="Cuando" value={a.cuando} editable={editable} placeholder="Qué la dispara…" onCommit={(v) => setItem(i, { cuando: v })} />
              <Campo rotulo="Hace" value={a.hace} editable={editable} placeholder="Qué hace…" onCommit={(v) => setItem(i, { hace: v })} />
              {/* 2026-10-25 — las ramas del Brief («bifurcación», «cumple / no cumple con criterio»). */}
              <Campo rotulo="Si…" value={a.condicion} editable={editable} placeholder="La condición que la bifurca (opcional)…" onCommit={(v) => setItem(i, { condicion: v })} />
              <Campo rotulo="Se cumple" value={a.siCumple} editable={editable} placeholder="Qué pasa si se cumple…" onCommit={(v) => setItem(i, { siCumple: v })} />
              <Campo rotulo="No se cumple" value={a.noCumple} editable={editable} placeholder="Qué pasa si no…" onCommit={(v) => setItem(i, { noCumple: v })} />
              <Campo rotulo="Resuelve" value={a.resuelve} editable={editable} placeholder="Qué problema resuelve…" onCommit={(v) => setItem(i, { resuelve: v })} />
              <Campo rotulo="Vista" value={a.vista} editable={editable} placeholder="La vista o el filtro que deja (Leads nuevos · Formulario del sitio)…" onCommit={(v) => setItem(i, { vista: v })} />
              <Campo rotulo="Ten en cuenta" value={a.considerar} editable={editable} placeholder="Lo que hay que considerar al construirla…" onCommit={(v) => setItem(i, { considerar: v })} />
              <Campo rotulo="Falta" value={a.falta} editable={editable} placeholder="Lo que todavía no está definido…" onCommit={(v) => setItem(i, { falta: v })} aviso />
            </dl>
            {(editable || a.fuente) && (
              <Editable as="div" className="stl-plan-fuente" editable={editable} value={a.fuente ?? ""} placeholder="Reunión que la respalda…" onCommit={(v) => setItem(i, { fuente: v })} />
            )}
          </div>
        ))}
      </div>
      {editable && <AddBtn label="Agregar automatización" onClick={() => set({ items: appendItem(items, { nombre: "", donde: "", cuando: "", hace: "", resuelve: "", falta: "", origen: "", fuente: "" }) })} />}
    </ConIntro>
  );
};

/* ── Conversaciones ─────────────────────────────────────────────────────────── */

export const ConversacionesSection: FC<SectionProps<ConversacionesData>> = ({ data, editable, onChange }) => {
  const d = adoptarConversaciones(data);
  const items = d.items;
  const set = (next: Partial<ConversacionesData>) => onChange?.({ ...partesDe(data), intro: d.intro, items: d.items, ...next });
  const setItem = (i: number, patch: Partial<Conversacion>) => set({ items: replaceAt(items, i, { ...items[i], ...patch }) });
  if (!editable && !items.length) return null;
  return (
    <ConIntro data={{ ...(data as object), intro: d.intro }} editable={editable} onCambios={(c) => set(c as unknown as Partial<ConversacionesData>)} placeholder="Los canales que entran a la bandeja de HubSpot y quién responde en cada uno…">
      <div className="stl-plan-cards">
        {items.map((c, i) => (
          <div key={i} className={`stl-plan-card stl-item${(c.falta ?? "").trim() || normalizarOrigen(c.origen) === "supuesto" ? " stl-plan-card--aviso" : ""}`}>
            {editable && <RemoveBtn onClick={() => set({ items: removeAt(items, i) })} title="Quitar esta conversación" />}
            <div className="stl-plan-card-h">
              <div>
                <Editable as="div" className="stl-plan-card-t" editable={editable} value={c.nombre} placeholder="Nombre (Agente de IA en WhatsApp)…" onCommit={(v) => setItem(i, { nombre: v })} />
                {(editable || c.canal) && (
                  <Editable as="div" className="stl-plan-fuente" editable={editable} value={c.canal ?? ""} placeholder="Canal · Hub…" onCommit={(v) => setItem(i, { canal: v })} />
                )}
              </div>
              <OrigenChip value={c.origen} editable={editable} onCommit={(v) => setItem(i, { origen: v })} />
            </div>
            <dl className="stl-plan-campos">
              {(editable || c.responde) && (
                <>
                  <dt>Responde</dt>
                  <dd><InlineSelect value={c.responde ?? ""} options={QUIEN_RESPONDE} editable={editable} onCommit={(v) => setItem(i, { responde: v })} ariaLabel="Quién responde" /></dd>
                </>
              )}
              <Campo rotulo="Para qué" value={c.paraQue} editable={editable} placeholder="Para qué sirve…" onCommit={(v) => setItem(i, { paraQue: v })} />
              <Campo rotulo="Pasa a" value={c.pasaA} editable={editable} placeholder="A quién pasa y cuándo…" onCommit={(v) => setItem(i, { pasaA: v })} />
              <Campo rotulo="Registra" value={c.registra} editable={editable} placeholder="Qué crea o actualiza en HubSpot…" onCommit={(v) => setItem(i, { registra: v })} />
              <Campo rotulo="Atienden" value={c.atienden} editable={editable} placeholder="Quiénes responden cuando pasa a una persona…" onCommit={(v) => setItem(i, { atienden: v })} />
              <Campo rotulo="Falta" value={c.falta} editable={editable} placeholder="Lo que todavía no está definido…" onCommit={(v) => setItem(i, { falta: v })} aviso />
            </dl>
            {/* 2026-10-25 — el guion del bot, como en la pestaña «Chatbot» del Brief: el saludo y los pasos. */}
            {((c.guion?.length ?? 0) > 0 || (editable && c.responde && c.responde !== "persona")) && (
              <ol className="stl-plan-guion">
                {(c.guion ?? []).map((g, j) => (
                  <li key={j}>
                    <span className="stl-plan-guion-n">{j === 0 ? "Saludo" : `Paso ${j}`}</span>
                    <Editable as="span" editable={editable} value={g} placeholder={j === 0 ? "Hola, soy…" : "Qué pregunta o qué ofrece…"} onCommit={(v) => setItem(i, { guion: replaceAt(c.guion ?? [], j, v) })} />
                    {editable && <RemoveBtn onClick={() => setItem(i, { guion: removeAt(c.guion ?? [], j) })} title="Quitar este paso" />}
                  </li>
                ))}
                {editable && (
                  <li>
                    <button type="button" className="stl-plan-mini" onClick={() => setItem(i, { guion: [...(c.guion ?? []), ""] })}>
                      {(c.guion?.length ?? 0) === 0 ? "+ Escribir el guion" : "+ Paso"}
                    </button>
                  </li>
                )}
              </ol>
            )}
            {(editable || c.fuente) && (
              <Editable as="div" className="stl-plan-fuente" editable={editable} value={c.fuente ?? ""} placeholder="Reunión que la respalda…" onCommit={(v) => setItem(i, { fuente: v })} />
            )}
          </div>
        ))}
      </div>
      {editable && <AddBtn label="Agregar conversación" onClick={() => set({ items: appendItem(items, { nombre: "", canal: "", responde: "", paraQue: "", pasaA: "", registra: "", falta: "", origen: "", fuente: "" }) })} />}
    </ConIntro>
  );
};
