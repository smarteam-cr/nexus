/**
 * lib/tests-diagnostico/enlace-leido.ts — LEER la dirección de un resultado del test, la vieja o la nueva. PURO y
 * CLIENT-SAFE.
 *
 * El test público de la aplicación vieja (escala-diagnostico) no guarda nada en una base: deja una nota en HubSpot y, en
 * el contacto, la DIRECCIÓN del resultado (`url_ultimo_diag_sales|marketing|service`), que trae el resultado entero
 * comprimido después del `#` (lz-string). Se decodifica esa dirección en vez de leer la nota: la nota es prosa para una
 * persona; la dirección, el dato. El test NUEVO, el de Nexus (`v: 2`, ./enlace.ts), deja una dirección igual, ya con la
 * escala de hoy.
 *
 * La leen la preventa y «Llegaron por el test» (por lib/exploraciones/test-de-marketing.ts, que reexporta esto) y, desde
 * O6 etapa 1 (2026-10-26), la página que reabre un resultado viejo (`/external/test/resultado/anterior`). Vive acá y no
 * en lib/exploraciones porque una página del cliente no puede importar la exploración (lib/exploraciones/lectores.test.ts).
 *
 * ⚠ El test viejo usa la escala ANTERIOR (versión 4). Sus 8 dimensiones por área corresponden una a una, por posición,
 * con las de hoy (procesos…equipo = x.1…x.4; express, tailor, amplify, evolve = x.5…x.8), y sus áreas cambiaron de
 * número (ventas 8 → 1, marketing 7 → 2, servicio 9 → 3). Por eso lo que sale de acá es HIPÓTESIS: el vendedor lo valida
 * en la primera reunión. Y por eso al modelo solo le llegan los ids y nombres de la escala de hoy, nunca las etiquetas
 * de la versión 4.
 */
import { decompressFromEncodedURIComponent } from "lz-string";
import type { Letra } from "@/lib/escala/documento/tipos";

export interface RespuestaLeidaDelTest {
  /** La dimensión de la escala de HOY (`1.3`). */
  dimensionId: string;
  nivel: Letra;
  /** La opción que eligió el prospecto, tal cual. */
  respuesta: string | null;
  /** Lo que agregó con sus palabras, si escribió algo. */
  matiz: string | null;
}

export interface ResultadoLeidoDelTest {
  /** El área de la escala de HOY: `1` Ventas, `2` Marketing, `3` Servicio. */
  areaId: string;
  /** `AAAA-MM-DD` o null. */
  fecha: string | null;
  respuestas: RespuestaLeidaDelTest[];
  url: string;
}

/** La página del resultado de la aplicación vieja. El nombre del archivo es lo que la reconoce. */
export const PAGINA_DEL_RESULTADO_VIEJO = "https://dev.smarteamcr.com/diagnostico-rendimiento/resultado.html";

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

/**
 * El resultado del test NUEVO, el de Nexus (2026-10-26, ./enlace.ts): `v: 2`, con la escala de hoy (las dimensiones por
 * su id y su letra). No hay que traducir nada: es la misma escala.
 */
function leerV2(crudo: Record<string, unknown>, url: string): ResultadoLeidoDelTest | null {
  const areaId = typeof crudo.area === "string" && /^[1-3]$/.test(crudo.area) ? crudo.area : null;
  if (!areaId || !esObjeto(crudo.dims)) return null;
  const qa = new Map<string, { respuesta: string | null; matiz: string | null }>();
  if (Array.isArray(crudo.qa)) {
    for (const q of crudo.qa) {
      if (esObjeto(q) && typeof q.dim === "string") qa.set(q.dim, { respuesta: texto(q.respuesta, 400), matiz: texto(q.matiz, 400) });
    }
  }
  const respuestas: RespuestaLeidaDelTest[] = [];
  for (const [id, nivel] of Object.entries(crudo.dims)) {
    if (!id.startsWith(`${areaId}.`) || typeof nivel !== "string" || !Object.values(NIVEL).includes(nivel as Letra)) continue;
    respuestas.push({ dimensionId: id, nivel: nivel as Letra, respuesta: qa.get(id)?.respuesta ?? null, matiz: qa.get(id)?.matiz ?? null });
  }
  if (respuestas.length === 0) return null;
  respuestas.sort((a, b) => a.dimensionId.localeCompare(b.dimensionId, "es", { numeric: true }));
  const fecha = typeof crudo.fecha === "string" && /^\d{4}-\d{2}-\d{2}/.test(crudo.fecha) ? crudo.fecha.slice(0, 10) : null;
  return { areaId, fecha, respuestas, url };
}

/** El resultado de una dirección del test, o null si no es una del test o no se puede leer. */
export function leerResultadoDelTest(url: string | null | undefined): ResultadoLeidoDelTest | null {
  if (!url) return null;
  const i = url.indexOf("#");
  if (i < 0 || !(/resultado\.html#/i.test(url) || /\/external\/test\/resultado\/[A-Za-z0-9_-]+#/.test(url))) return null;
  let crudo: unknown;
  try {
    const json = decompressFromEncodedURIComponent(url.slice(i + 1));
    if (!json) return null;
    crudo = JSON.parse(json);
  } catch {
    return null;
  }
  if (esObjeto(crudo) && crudo.v === 2) return leerV2(crudo, url);
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

  const respuestas: RespuestaLeidaDelTest[] = [];
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
