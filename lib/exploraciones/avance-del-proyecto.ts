/**
 * lib/exploraciones/avance-del-proyecto.ts — cuánto avanzó la exploración de un PROYECTO y qué sigue.
 * PURO.
 *
 * La preventa mide «lista para proponer el land» (calidad.ts). Un proyecto ya se vendió: lo que mide es
 * cuánto se entiende al cliente (2026-10-07):
 *   · la estrategia — retos, resultados que persigue (en cifras) y obstáculos;
 *   · la escala — cuántas dimensiones de las áreas en juego ya tienen evidencia (lo dijo el cliente).
 */
import type { ResultadoDelChequeo } from "@/lib/escala/chequeo";
import { metaEnCifras, type Meta, type Reto } from "./casillas";
import type { EstadoDeExploracion } from "./contenido";
import { diaCorto, hoyEnCostaRica } from "./fechas";
import type { SesionesParaQueSigue } from "./calidad";
import { avisoDeLasSesiones } from "./guia";
import type { ReunionSinLeer } from "./lectura";
import { definicionEnElMarco, MARCO_DE_CS } from "./marco";

export interface PuntoDelProyecto {
  id: "retos" | "metas" | "obstaculos";
  /** Para el chip: «Retos», «Resultados que persigue», «Obstáculos». */
  corto: string;
  /** Qué hace falta, en una frase. */
  titulo: string;
  cumplido: boolean;
}

/** Las tres tarjetas de la estrategia, con si ya están: los resultados piden una cifra. */
export function avanceDeLaEstrategia(estado: EstadoDeExploracion): PuntoDelProyecto[] {
  const c = estado.contenido.casillas;
  const retos = ((c.retos ?? []) as Reto[]).length > 0;
  const metas = ((c.metas ?? []) as Meta[]).some(metaEnCifras);
  const obstaculos = ((c.obstaculos ?? []) as Reto[]).length > 0;
  const etiqueta = (k: PuntoDelProyecto["id"]) => definicionEnElMarco(k, MARCO_DE_CS).etiqueta;
  return [
    { id: "retos", corto: etiqueta("retos"), titulo: "Los retos que el cliente tiene hoy", cumplido: retos },
    { id: "metas", corto: etiqueta("metas"), titulo: "Los resultados que persigue, en cifras", cumplido: metas },
    { id: "obstaculos", corto: etiqueta("obstaculos"), titulo: "Lo que le impide llegar", cumplido: obstaculos },
  ];
}

/**
 * Lo que falta de la estrategia y ninguna pregunta de la guía pregunta: el cierre de la sesión lo pide («Si no salió en
 * la conversación, pregunta: …», plan-de-la-guia.ts › `siNoSalio`). Es el par de `faltanAlCerrar` de la preventa
 * (calidad.ts). `temas` son los temas que pregunta la guía (las tarjetas y las dimensiones).
 */
export function faltanDeLaEstrategia(puntos: readonly Pick<PuntoDelProyecto, "id" | "titulo" | "cumplido">[], temas: ReadonlySet<string>): string[] {
  return puntos.filter((p) => !p.cumplido && !temas.has(p.id)).map((p) => p.titulo);
}

/** Cuántas dimensiones de las áreas en juego tienen evidencia (lo confirmado con evidencia), de cuántas. */
export function escalaConEvidencia(chequeo: ResultadoDelChequeo): { con: number; de: number } {
  let con = 0;
  let de = 0;
  for (const a of chequeo.areas) {
    for (const d of a.dimensiones) {
      if (!d.aplica) continue;
      de++;
      if (d.nivel !== null) con++;
    }
  }
  return { con, de };
}

/**
 * Qué sigue en la exploración de un proyecto, en una frase. Con `sesiones`, lo que falta en ellas va
 * primero (etapa A: la exploración de un proyecto arranca vacía, nada entra solo).
 */
export function queSigueDelProyecto(
  estado: EstadoDeExploracion,
  chequeo: ResultadoDelChequeo,
  sinLeer: readonly ReunionSinLeer[],
  revisables: number,
  sesiones?: SesionesParaQueSigue,
): string {
  const aviso = sesiones ? avisoDeLasSesiones(sesiones.pestanas, { automaticas: sesiones.automaticas, hoy: hoyEnCostaRica(sesiones.ahora), ahora: sesiones.ahora }) : null;
  if (aviso) return aviso;
  if (sinLeer.length === 1) {
    const r = sinLeer[0];
    return r.origen === "documento"
      ? `Hay algo que sumaste sin leer («${r.titulo}», ${diaCorto(r.fecha)}): pídele al agente que lo lea.`
      : `Hay una sesión sin leer («${r.titulo}», ${diaCorto(r.fecha)}): pídele al agente que la lea.`;
  }
  if (sinLeer.length > 1) return `Hay ${sinLeer.length} sesiones o documentos sin leer: pídele al agente que los lea.`;
  if (revisables > 0) return `Revisa lo que sugirió el agente: ${revisables} ${revisables === 1 ? "cosa" : "cosas"} para usar o descartar.`;
  if (estado.areas.length === 0) return "Elige las áreas en juego (abajo, en «La escala»): la guía pregunta por sus dimensiones.";
  const falta = avanceDeLaEstrategia(estado).find((p) => !p.cumplido);
  if (estado.propuesta.leidas.sesiones.length === 0 && estado.propuesta.leidas.documentos.length === 0) {
    return "Haz la primera sesión con la guía: los retos del cliente, los resultados que persigue y qué se lo impide. Cuando llegue la transcripción, pídele al agente que la lea.";
  }
  if (falta) return `Falta: ${falta.titulo.toLowerCase()}. La guía de la próxima sesión lo pregunta.`;
  const { con, de } = escalaConEvidencia(chequeo);
  if (de > 0 && con < de) return `La estrategia está. Faltan ${de - con} ${de - con === 1 ? "dimensión" : "dimensiones"} de la escala con evidencia: la guía las pregunta.`;
  return "La estrategia y la escala están confirmadas. Lo confirmado ya lo leen el Diagnóstico y la Planificación.";
}

/**
 * Lo que la persona acaba de confirmar en la estrategia (retos, resultados, obstáculos): lo que está
 * ahora y no estaba antes, cada cosa con su tarjeta. Va como sugerencia a Información del cliente.
 */
export function loNuevoDeLaEstrategia(antes: EstadoDeExploracion, despues: EstadoDeExploracion): { pregunta: string; respuesta: string }[] {
  const lineas = (e: EstadoDeExploracion, k: PuntoDelProyecto["id"]): string[] => {
    const v = e.contenido.casillas[k] as unknown;
    if (!Array.isArray(v)) return [];
    return k === "metas"
      ? (v as Meta[]).map((m) => [m.que, m.actual && `hoy: ${m.actual}`, m.objetivo && `meta: ${m.objetivo}`, m.para && `para: ${m.para}`].filter(Boolean).join(" · "))
      : (v as Reto[]).map((r) => r.texto);
  };
  const out: { pregunta: string; respuesta: string }[] = [];
  for (const k of ["retos", "metas", "obstaculos"] as const) {
    const ya = new Set(lineas(antes, k));
    for (const t of lineas(despues, k)) {
      if (t && !ya.has(t)) out.push({ pregunta: definicionEnElMarco(k, MARCO_DE_CS).etiqueta, respuesta: t });
    }
  }
  return out;
}
