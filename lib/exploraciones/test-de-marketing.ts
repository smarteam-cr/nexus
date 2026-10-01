/**
 * lib/exploraciones/test-de-marketing.ts — leer el resultado del test de marketing. PURO.
 *
 * El test público (escala-diagnostico) no guarda nada en una base: deja una nota en HubSpot y, en el
 * contacto, la DIRECCIÓN del resultado (`url_ultimo_diag_sales|marketing|service`), que trae el
 * resultado entero comprimido después del `#` (lz-string). Se decodifica esa dirección en vez de
 * leer la nota: la nota es prosa para una persona; la dirección, el dato.
 *
 * ⚠ El test usa la escala ANTERIOR (versión 4). Sus 8 dimensiones por área corresponden una a una,
 * por posición, con las de hoy (procesos…equipo = x.1…x.4; express, tailor, amplify, evolve =
 * x.5…x.8), y sus áreas cambiaron de número (ventas 8 → 1, marketing 7 → 2, servicio 9 → 3). Por
 * eso lo que sale de acá es HIPÓTESIS: el vendedor lo valida en la primera reunión. Y por eso al
 * modelo solo le llegan los ids y nombres de la escala de hoy, nunca las etiquetas de la versión 4.
 */
import { decompressFromEncodedURIComponent } from "lz-string";
import type { Letra } from "@/lib/escala/documento/tipos";

export interface RespuestaDelTest {
  /** La dimensión de la escala de HOY (`1.3`). */
  dimensionId: string;
  nivel: Letra;
  /** La opción que eligió el prospecto, tal cual. */
  respuesta: string | null;
  /** Lo que agregó con sus palabras, si escribió algo. */
  matiz: string | null;
}

export interface ResultadoDelTest {
  /** El área de la escala de HOY: `1` Ventas, `2` Marketing, `3` Servicio. */
  areaId: string;
  /** `AAAA-MM-DD` o null. */
  fecha: string | null;
  respuestas: RespuestaDelTest[];
  url: string;
}

/** Las propiedades del contacto que guardan la dirección del resultado, por área de hoy. */
export const PROPIEDADES_DEL_TEST: Record<string, string> = {
  "1": "url_ultimo_diag_sales",
  "2": "url_ultimo_diag_marketing",
  "3": "url_ultimo_diag_service",
};

const AREA_DEL_TEST: Record<string, string> = { ventas: "1", marketing: "2", servicio: "3" };
const POSICION: Record<string, number> = {
  procesos: 1,
  tecnologia: 2,
  datos: 3,
  equipo: 4,
  express: 5,
  tailor: 6,
  amplify: 7,
  evolve: 8,
};
const NIVEL: Record<number, Letra> = { 1: "D", 2: "I", 3: "F", 4: "E", 5: "O" };

const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const texto = (x: unknown, max: number): string | null => (typeof x === "string" && x.trim() ? x.trim().slice(0, max) : null);

/** El resultado de una dirección del test, o null si no es una del test o no se puede leer. */
export function leerResultadoDelTest(url: string | null | undefined): ResultadoDelTest | null {
  if (!url) return null;
  const i = url.indexOf("#");
  if (i < 0 || !/resultado\.html#/i.test(url)) return null;
  let crudo: unknown;
  try {
    const json = decompressFromEncodedURIComponent(url.slice(i + 1));
    if (!json) return null;
    crudo = JSON.parse(json);
  } catch {
    return null;
  }
  if (!esObjeto(crudo) || crudo.v !== 1 || typeof crudo.area !== "string") return null;
  const areaId = AREA_DEL_TEST[crudo.area];
  if (!areaId || !esObjeto(crudo.dims)) return null;

  // Las respuestas, con su matiz, vienen en `qa` (pregunta → opción, «Matiz que agregaste» → texto).
  const porDim = new Map<string, { respuesta: string | null; matiz: string | null }>();
  if (Array.isArray(crudo.qa)) {
    for (const q of crudo.qa) {
      if (!esObjeto(q) || typeof q.dim !== "string" || !Array.isArray(q.pares)) continue;
      const pares = q.pares.filter(esObjeto);
      porDim.set(q.dim, {
        respuesta: texto(pares[0]?.a, 400),
        matiz: texto(pares.find((p) => typeof p.q === "string" && /matiz/i.test(p.q))?.a, 400),
      });
    }
  }

  const respuestas: RespuestaDelTest[] = [];
  for (const [clave, d] of Object.entries(crudo.dims)) {
    const pos = POSICION[clave];
    if (!pos || !esObjeto(d) || typeof d.nivel !== "number" || !NIVEL[d.nivel]) continue;
    respuestas.push({
      dimensionId: `${areaId}.${pos}`,
      nivel: NIVEL[d.nivel],
      respuesta: porDim.get(clave)?.respuesta ?? null,
      matiz: porDim.get(clave)?.matiz ?? null,
    });
  }
  if (respuestas.length === 0) return null;
  respuestas.sort((a, b) => a.dimensionId.localeCompare(b.dimensionId, "es", { numeric: true }));

  const fecha = typeof crudo.fecha === "string" && /^\d{4}-\d{2}-\d{2}/.test(crudo.fecha) ? crudo.fecha.slice(0, 10) : null;
  return { areaId, fecha, respuestas, url };
}
