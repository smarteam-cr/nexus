/**
 * lib/exploraciones/tarjetas-de-la-escala.ts — LA TARJETA DE CADA DIMENSIÓN en La escala de la preventa (2026-11-08,
 * cuarta vuelta con Centauro Solutions). PURO y client-safe.
 *
 * Elías: «cada dimensión tiene, al pasar el cursor, el mismo tooltip que en la página de resultado del diagnóstico, pero
 * armado por el agente y para uso interno»: en simple, cómo está esa área según lo explorado, y qué se puede preguntar
 * para explorar más. Cada pregunta se puede mandar a la exploración para que entre en la planificación de las próximas
 * sesiones.
 *
 *   · El texto lo escribe la MISMA corrida de «Ubicar con las reuniones» (agente-pedido.ts › `pedidoDePosicionar`, campo
 *     `tarjetas`): ni una llamada por visita ni una por dimensión. Vive en `propuesta.tarjetasDeLaEscala` (Json de la
 *     exploración, sin SQL) y la corrida siguiente lo reemplaza entero. Sin corrida todavía, la tarjeta se arma con lo que
 *     ya hay: el porqué del nivel y la pregunta de la escala para confirmarlo (`tarjetaParaMostrar`).
 *   · «Mandar a la exploración» usa lo que la guía ya lee, sin un camino nuevo (`opsParaLlevar`): la pregunta entra a lo
 *     que se lleva la próxima sesión (`SesionPlaneada.explorar`, con su dimensión en `explorarPara` y la misma sesión en
 *     `explorarDe`: la guía la muestra «Lo llevaste desde La escala» y el pedido de la guía la recibe en «paraExplorar»).
 *     Se deshace con el mismo botón (`opsParaQuitar`). Sin una próxima sesión planeada, no se lleva: se dice.
 */
import { MAX_PARA_EXPLORAR, type SesionPlaneada } from "./guia";
import type { CambioDeSesion, CampoDeSesionEditable, Operacion } from "./contenido";

export const MAX_COMO_ESTA = 400;
export const MAX_PREGUNTA_DE_LA_TARJETA = 240;
export const MAX_PREGUNTAS_DE_LA_TARJETA = 3;
/** Las tres áreas de ocho: 24 tarjetas. Con margen por si una edición suma alguna. */
export const MAX_TARJETAS = 40;

export interface TarjetaDeLaDimension {
  /** En simple, cómo está esa parte según lo explorado (para el vendedor, no para el cliente). */
  comoEsta: string;
  /** Qué preguntar para explorarla más (1 a 3). */
  preguntas: string[];
}

/** Lo que dejó la última corrida de «Ubicar con las reuniones» (`propuesta.tarjetasDeLaEscala`). */
export interface TarjetasDeLaEscala {
  porDimension: Record<string, TarjetaDeLaDimension>;
  en: string;
  corridaId: string | null;
}

const limpio = (x: unknown, max: number): string | null => {
  if (typeof x !== "string") return null;
  const t = x.trim().replace(/\s+/g, " ");
  return t ? t.slice(0, max) : null;
};

/**
 * Lo que devolvió el agente en `tarjetas`, leído con tolerancia: solo dimensiones de la escala, sin texto vacío, como
 * mucho tres preguntas sin repetir. Una dimensión repetida se queda con la primera.
 */
export function leerTarjetasDelAgente(raw: unknown, dimensionesValidas: ReadonlySet<string>): Record<string, TarjetaDeLaDimension> {
  const out: Record<string, TarjetaDeLaDimension> = {};
  if (!Array.isArray(raw)) return out;
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const id = typeof o.dimensionId === "string" ? o.dimensionId.trim() : "";
    if (!dimensionesValidas.has(id) || out[id]) continue;
    const comoEsta = limpio(o.comoEsta, MAX_COMO_ESTA);
    const preguntas = [
      ...new Set((Array.isArray(o.preguntas) ? o.preguntas : []).map((p) => limpio(p, MAX_PREGUNTA_DE_LA_TARJETA)).filter((p): p is string => !!p)),
    ].slice(0, MAX_PREGUNTAS_DE_LA_TARJETA);
    if (!comoEsta && !preguntas.length) continue;
    out[id] = { comoEsta: comoEsta ?? "", preguntas };
    if (Object.keys(out).length >= MAX_TARJETAS) break;
  }
  return out;
}

/**
 * La tarjeta que se muestra: la del agente o, sin ella, la que se arma con lo que ya hay (el porqué del nivel y la
 * pregunta de la escala). `deAgente` dice cuál es, para que la pantalla no presente como del agente lo que no lo es.
 */
export function tarjetaParaMostrar(
  delAgente: TarjetaDeLaDimension | undefined,
  base: { porQue: string | null; preguntaDeLaEscala: string; conNivel: boolean },
): TarjetaDeLaDimension & { deAgente: boolean } {
  if (delAgente && (delAgente.comoEsta || delAgente.preguntas.length)) {
    return {
      comoEsta: delAgente.comoEsta || base.porQue || "",
      preguntas: delAgente.preguntas.length ? delAgente.preguntas : [base.preguntaDeLaEscala].filter(Boolean),
      deAgente: true,
    };
  }
  return {
    comoEsta: base.porQue ?? (base.conNivel ? "" : "Todavía sin dato de esta parte."),
    preguntas: [base.preguntaDeLaEscala].filter(Boolean),
    deAgente: false,
  };
}

const igual = (a: string, b: string) => a.trim().toLowerCase().replace(/\s+/g, " ") === b.trim().toLowerCase().replace(/\s+/g, " ");

/** ¿Ya va esa pregunta a la próxima sesión? */
export function yaLlevada(pregunta: string, sesion: Pick<SesionPlaneada, "explorar"> | null): boolean {
  return !!sesion && (sesion.explorar ?? []).some((t) => igual(t, pregunta));
}

/** ¿La llevó el vendedor desde La escala (y no quedó abierta en otra sesión)? Solo esas se pueden quitar desde la tarjeta. */
export function llevadaDesdeLaEscala(pregunta: string, sesion: Pick<SesionPlaneada, "id" | "explorar" | "explorarDe"> | null): boolean {
  const t = sesion?.explorar?.find((x) => igual(x, pregunta));
  return !!t && sesion?.explorarDe?.[t] === sesion?.id;
}

export type Llevar = { ok: true; ops: Operacion[] } | { ok: false; error: string };

/** La sesión con otra lista de lo que lleva: sus mapas quedan solo con lo que sigue en la lista (el esquema topa sus claves). */
function conLaLista(s: SesionPlaneada, explorar: string[], extra?: { texto: string; para: string }): Operacion {
  const solo = (m: Record<string, string> | undefined) => Object.fromEntries(Object.entries(m ?? {}).filter(([t]) => explorar.includes(t)));
  const explorarPara = { ...solo(s.explorarPara), ...(extra ? { [extra.texto]: extra.para } : {}) };
  // `explorarDe` con el id de esta misma sesión: la guía la muestra «Lo llevaste desde La escala» (guia.ts).
  const explorarDe = { ...solo(s.explorarDe), ...(extra ? { [extra.texto]: s.id } : {}) };
  const quitar: CampoDeSesionEditable[] = [];
  const poner: CambioDeSesion = {};
  if (explorar.length) poner.explorar = explorar;
  else quitar.push("explorar");
  if (Object.keys(explorarPara).length) poner.explorarPara = explorarPara;
  else quitar.push("explorarPara");
  if (Object.keys(explorarDe).length) poner.explorarDe = explorarDe;
  else quitar.push("explorarDe");
  return { op: "editarSesion", sesionId: s.id, poner, quitar };
}

/**
 * Las operaciones que llevan una pregunta a la próxima sesión (ver el encabezado): se suma a lo que se lleva, con su
 * dimensión. Una pregunta que ya estaba no se duplica (ops vacías); con la lista llena, se dice. Sin una próxima sesión
 * planeada no hay a dónde llevarla: se dice (la revisión cazó que marcar «explorar a fondo» pisaba lo que ya estaba y la
 * guía no leía la pregunta).
 */
export function opsParaLlevar(o: { pregunta: string; dimensionId: string; sesion: SesionPlaneada | null }): Llevar {
  const pregunta = o.pregunta.trim().replace(/\s+/g, " ").slice(0, 600);
  if (!pregunta) return { ok: false, error: "La pregunta está vacía." };
  if (!o.sesion) return { ok: false, error: "Todavía no hay una próxima sesión planeada: agrégala en Exploración y vuelve a llevar la pregunta." };
  const s = o.sesion;
  if (yaLlevada(pregunta, s)) return { ok: true, ops: [] };
  const explorar = s.explorar ?? [];
  if (explorar.length >= MAX_PARA_EXPLORAR) {
    return { ok: false, error: `La próxima sesión ya lleva ${MAX_PARA_EXPLORAR} temas para explorar: quita uno antes de sumar otro.` };
  }
  return { ok: true, ops: [conLaLista(s, [...explorar, pregunta], { texto: pregunta, para: o.dimensionId })] };
}

/** Deshace «Llevar»: saca la pregunta de la próxima sesión. Solo lo llevado desde La escala (lo demás lo maneja su sesión). */
export function opsParaQuitar(o: { pregunta: string; sesion: SesionPlaneada | null }): Llevar {
  const s = o.sesion;
  if (!s || !llevadaDesdeLaEscala(o.pregunta, s)) return { ok: true, ops: [] };
  return { ok: true, ops: [conLaLista(s, (s.explorar ?? []).filter((t) => !igual(t, o.pregunta)))] };
}
