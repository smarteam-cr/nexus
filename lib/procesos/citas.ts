/**
 * lib/procesos/citas.ts — LA CITA LA VERIFICA EL CÓDIGO, NO EL MODELO.
 *
 * Puro. Un paso «dicho» (hoy) o «acordado» (después) tiene que traer una frase que aparezca TAL CUAL
 * en la transcripción de su reunión. La comparación ignora mayúsculas, tildes y puntuación, y tolera
 * que la primera y la última palabra estén cortadas (los cortes de turno de la transcripción). Si no
 * aparece, la cita se descarta y el paso baja a «supuesto» (hoy) o «propuesto» (después). Además se
 * le pone el minuto y quién la dijo, que salen de la propia transcripción.
 *
 * Medido con el prototipo (2026-10-05): 423 de 423 citas del paso 1 y 218 de 218 de los mapas de
 * FUNDAUNA y Areyá aparecieron tal cual. La red existe para el día en que no.
 */
import type { CitaDelPaso, CitaSinUbicar, OrigenDelPaso, PasoDelMapa } from "./mapa";

export function normalizarTexto(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface LineaDeTranscripcion {
  /** Marca de tiempo vigente («12:30» o «1:02:15»). */
  tiempo: string;
  quien: string;
  texto: string;
}

export interface ReunionParaCitar {
  id: string;
  titulo: string;
  fecha: string;
  lineas: LineaDeTranscripcion[];
  /** Toda la transcripción normalizada, sin nombres de quien habla. */
  todo: string;
}

/**
 * Parte una transcripción de Google Meet en líneas («Nombre: texto», con marcas «00:12:30» sueltas).
 * Lo que no tiene «Nombre: » entra igual, sin quien.
 */
export function prepararReunion(r: { id: string; titulo: string; fecha: string; transcript: string }): ReunionParaCitar {
  let tiempo = "0:00";
  const lineas: LineaDeTranscripcion[] = [];
  for (const cruda of r.transcript.split(/\r?\n/)) {
    const l = cruda.trim();
    if (!l) continue;
    const marca = l.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
    if (marca) {
      const h = parseInt(marca[1], 10);
      tiempo = h > 0 ? `${h}:${marca[2]}:${marca[3]}` : `${parseInt(marca[2], 10)}:${marca[3]}`;
      continue;
    }
    const i = l.indexOf(": ");
    const tieneQuien = i > 0 && i < 60;
    lineas.push({ tiempo, quien: tieneQuien ? l.slice(0, i) : "", texto: normalizarTexto(tieneQuien ? l.slice(i + 2) : l) });
  }
  return { id: r.id, titulo: r.titulo, fecha: r.fecha, lineas, todo: lineas.map((x) => x.texto).join(" ") };
}

/** Las formas en que se busca una cita: entera, o sin la primera y la última palabra. */
function formasDe(cita: string): string[] {
  const n = normalizarTexto(cita);
  if (n.length < 12) return [];
  const palabras = n.split(" ");
  return palabras.length > 6 ? [n, palabras.slice(1, -1).join(" ")] : [n];
}

/** ¿La cita aparece tal cual en la reunión? */
export function citaAparece(reunion: ReunionParaCitar, cita: string): boolean {
  return formasDe(cita).some((f) => reunion.todo.includes(f));
}

/** Dónde aparece: el minuto y quién la dijo (de la línea que la contiene). */
export function ubicarCita(reunion: ReunionParaCitar, cita: string): { minuto?: string; quien?: string } {
  for (const f of formasDe(cita)) {
    const l = reunion.lineas.find((x) => x.texto.includes(f));
    if (l) return { minuto: l.tiempo, quien: l.quien || undefined };
  }
  return {};
}

/**
 * Pasa las citas de un paso (con la clave de su reunión) a citas verificadas y ubicadas, y baja el
 * origen si ninguna se sostiene.
 */
export function verificarPaso<P extends { origen: OrigenDelPaso; citas: CitaSinUbicar[] }>(
  paso: P,
  reuniones: ReadonlyMap<string, ReunionParaCitar>,
  cual: "hoy" | "despues",
): Omit<P, "citas" | "origen"> & { citas: CitaDelPaso[]; origen: OrigenDelPaso; citasDescartadas: number } {
  const citas: CitaDelPaso[] = [];
  let descartadas = 0;
  for (const c of paso.citas) {
    const r = reuniones.get(c.sesion);
    if (!r || !citaAparece(r, c.cita)) {
      descartadas++;
      continue;
    }
    citas.push({ sesionId: r.id, sesionTitulo: r.titulo, fecha: r.fecha, cita: c.cita, ...ubicarCita(r, c.cita) });
  }
  let origen = paso.origen;
  if ((origen === "dicho" || origen === "acordado") && citas.length === 0) origen = cual === "hoy" ? "supuesto" : "propuesto";
  return { ...paso, citas, origen, citasDescartadas: descartadas };
}

/** Lo mismo, para todos los pasos de una versión. Devuelve cuántas citas se sostuvieron. */
export function verificarPasos(
  pasos: (Omit<PasoDelMapa, "citas"> & { citas: CitaSinUbicar[] })[],
  reuniones: ReadonlyMap<string, ReunionParaCitar>,
  cual: "hoy" | "despues",
): { pasos: PasoDelMapa[]; citas: number; citasOk: number; bajados: number } {
  let citasTotal = 0;
  let citasOk = 0;
  let bajados = 0;
  const salida = pasos.map((p) => {
    const v = verificarPaso(p, reuniones, cual);
    citasTotal += p.citas.length;
    citasOk += v.citas.length;
    if (v.origen !== p.origen) bajados++;
    const paso: PasoDelMapa = { ...p, citas: v.citas, origen: v.origen };
    return paso;
  });
  return { pasos: salida, citas: citasTotal, citasOk, bajados };
}
