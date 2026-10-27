/**
 * lib/tests-diagnostico/resultado-anterior.ts — REABRIR UN RESULTADO DE LA APLICACIÓN VIEJA en Nexus (O6 etapa 1,
 * 2026-10-26). PURO y CLIENT-SAFE.
 *
 * La aplicación vieja dejó en HubSpot, en correos y en marcadores de la gente direcciones como
 * `dev.smarteamcr.com/diagnostico-rendimiento/resultado.html#<lz>`: el resultado entero va después del `#` (`v: 1`, la
 * escala versión 4). Cuando esa página se apague, nginx manda esa dirección a `/external/test/resultado/anterior` y el
 * navegador conserva el `#`. Lo que pasa ahí:
 *   1. el navegador lee el `#` (el servidor nunca lo ve) con el mismo lector de la preventa (./enlace-leido.ts) y se
 *      queda solo con el área, la letra de cada dimensión y la fecha (`?a=1&n=IFDIIFID&f=2026-09-25`);
 *   2. el servidor arma el resultado con la escala de HOY y el mismo cálculo del test nuevo (./resultado.ts): la página
 *      se ve igual a la de un test de Nexus, sin JS.
 * *Por qué solo las letras y no el resto:* la dirección vieja la puede escribir cualquiera; mostrar en
 * nexus.smarteamcr.com el nombre, la empresa o un texto que viene en ella sería prestarle la página a quien la arme. Las
 * letras solo eligen un resultado que Nexus mismo calcula. Y la URL nueva no lleva datos personales: los registros de
 * nginx la guardan.
 * *Por qué con la escala de hoy y no la de la v4:* hay un solo motor (DECISIONS › área O); el nivel puede no ser el
 * mismo que vio la persona ese día, y la página lo dice.
 */
import type { Escala, Letra } from "@/lib/escala/documento/tipos";
import type { ResultadoLeidoDelTest } from "./enlace-leido";
import { resultadoDelTest, type ResultadoDelTest } from "./resultado";
import type { PreguntaDelBanco, RespuestasDelTest } from "./tipos";

export const RUTA_DEL_RESULTADO_ANTERIOR = "/external/test/resultado/anterior";

/** Cuántas dimensiones puede traer un área en la dirección corta (hoy son 8; margen para la 9.0). */
const MAX_DIMENSIONES = 12;
const LETRA = /^[DIFEO]$/;

export interface NivelesDelResultadoAnterior {
  areaId: string;
  /** La letra de cada dimensión de hoy (`1.3` → `F`). */
  niveles: Record<string, Letra>;
  /** `AAAA-MM-DD` o null. */
  fecha: string | null;
}

/**
 * La parte de la dirección nueva: `a` el área, `n` una letra por posición (`-` donde no hay) y `f` la fecha. Null si lo
 * leído no tiene una dimensión que se pueda poner por posición.
 */
export function direccionDelResultadoAnterior(leido: ResultadoLeidoDelTest): string | null {
  const letras: string[] = [];
  for (const r of leido.respuestas) {
    const m = r.dimensionId.match(/^([1-3])\.(\d{1,2})$/);
    if (!m || m[1] !== leido.areaId) continue;
    const pos = Number(m[2]);
    if (pos < 1 || pos > MAX_DIMENSIONES) continue;
    while (letras.length < pos) letras.push("-");
    letras[pos - 1] = r.nivel;
  }
  if (!letras.some((l) => LETRA.test(l))) return null;
  const q = new URLSearchParams({ a: leido.areaId, n: letras.join("") });
  if (leido.fecha) q.set("f", leido.fecha);
  return `${RUTA_DEL_RESULTADO_ANTERIOR}?${q.toString()}`;
}

/** Lee `?a&n&f` sin confiar en nada: lo que no tiene la forma exacta es null. */
export function leerNivelesDelResultadoAnterior(q: { a?: unknown; n?: unknown; f?: unknown }): NivelesDelResultadoAnterior | null {
  if (typeof q.a !== "string" || !/^[1-3]$/.test(q.a)) return null;
  if (typeof q.n !== "string" || !new RegExp(`^[DIFEO-]{1,${MAX_DIMENSIONES}}$`).test(q.n)) return null;
  const niveles: Record<string, Letra> = {};
  [...q.n].forEach((l, i) => {
    if (LETRA.test(l)) niveles[`${q.a}.${i + 1}`] = l as Letra;
  });
  if (!Object.keys(niveles).length) return null;
  const fecha = typeof q.f === "string" && /^\d{4}-\d{2}-\d{2}$/.test(q.f) && !Number.isNaN(Date.parse(q.f)) ? q.f : null;
  return { areaId: q.a, niveles, fecha };
}

/**
 * El resultado con la escala de hoy: cada dimensión que trae la dirección cuenta como contestada con su letra (un banco
 * de una opción por dimensión, armado acá), y la que no trae no cuenta. Las dimensiones que la escala de hoy no tiene se
 * ignoran. Null si no queda ninguna.
 */
export function resultadoDelTestAnterior(escala: Escala, l: NivelesDelResultadoAnterior): ResultadoDelTest | null {
  const area = escala.areas.find((a) => a.id === l.areaId);
  if (!area) return null;
  const preguntas: PreguntaDelBanco[] = [];
  const respuestas: RespuestasDelTest = {};
  for (const d of area.dimensiones) {
    const nivel = l.niveles[d.id];
    if (!nivel) continue;
    preguntas.push({ id: d.id, dimensionId: d.id, texto: d.nombre, ayuda: null, opciones: [{ id: "elegida", texto: nivel, nivel }] });
    respuestas[d.id] = { opcion: "elegida" };
  }
  if (!preguntas.length) return null;
  return resultadoDelTest({ escala, areaId: area.id, version: "web", preguntas, respuestas });
}
