/**
 * lib/landing/adaptar-modulo.ts — «ADAPTAR A ESTA EMPRESA»: EL PEDIDO A LA IA Y CÓMO SE LEE LO QUE DEVUELVE.
 *
 * PURO. Sin Prisma ni la llamada al modelo (eso vive en `adaptar-modulo-server.ts`).
 *
 * ── LA REGLA QUE SOSTIENE TODO ────────────────────────────────────────────────────────────────
 * La IA cambia TEXTOS, nunca el diseño. No recibe el HTML: recibe la lista numerada de sus textos
 * (`extraerTextos`) y devuelve, por número, solo los que cambian. El HTML se rearma reemplazando
 * esos rangos (`aplicarTextos`), así que una clase, un color o una línea del script no pueden
 * cambiar aunque el modelo lo intente.
 *
 * Y no aplica nada: devuelve una PROPUESTA (cada cambio con su antes y su después) que una persona
 * revisa, desmarca lo que no quiere y aplica.
 */
import { voseoEnProsa } from "@/lib/ui/voseo-formas";
import type { SegmentoDeTexto } from "./html-textos";

/** Tope de caracteres de textos que se le mandan al modelo. Lo que no entra no se adapta, y se dice. */
export const MAX_CARACTERES_DEL_PEDIDO = 40_000;

export interface ContextoDeAdaptacion {
  /** La empresa de ESTA propuesta. */
  clienteNuevo: string;
  /** La empresa para la que se armó el módulo, si se sabe. */
  clienteOrigen?: string | null;
  /** Lo que dice la propuesta de este cliente (portada, dolores, solución), ya resumido. */
  propuesta: string;
  /** Lo que se encontró del cliente original al guardar el módulo (ya en frase). */
  avisos?: string;
  /** Idioma de la propuesta ("es" por defecto). */
  lang?: string | null;
}

export interface CambioPropuesto {
  id: number;
  antes: string;
  despues: string;
  /** "⚠ voseo" u otra marca para que la persona lo mire con cuidado. */
  aviso?: string;
}

export interface PropuestaDeAdaptacion {
  cambios: CambioPropuesto[];
  /** Lo que la IA dice que una persona tiene que revisar a mano (montos, datos que no tiene). */
  notas: string[];
  /** Cuántos textos no entraron en el pedido (los últimos del HTML). */
  sinRevisar: number;
}

/** Qué textos entran en el pedido, en orden, hasta el tope. */
export function segmentosDelPedido(segmentos: readonly SegmentoDeTexto[]): { entran: SegmentoDeTexto[]; sinRevisar: number } {
  const entran: SegmentoDeTexto[] = [];
  let total = 0;
  for (const s of segmentos) {
    total += s.texto.length + 12;
    if (total > MAX_CARACTERES_DEL_PEDIDO) break;
    entran.push(s);
  }
  return { entran, sinRevisar: segmentos.length - entran.length };
}

export const SISTEMA_DE_ADAPTACION = `Adaptas una sección de una propuesta comercial de Smarteam (agencia de HubSpot) que se armó para otra empresa, para que hable de la empresa nueva.

Recibes la lista NUMERADA de los textos de la sección: el resto (diseño, estilos, código) no lo ves y no se toca. Devuelves solo los textos que cambian.

Reglas:
- Cambia lo que es de la empresa original: su nombre, sus marcas, sus procesos, sus sistemas, su industria, sus personas, sus ejemplos. Lo genérico (cómo trabaja Smarteam, qué hace HubSpot) queda igual: no lo devuelvas.
- Usa lo que dice la propuesta de la empresa nueva. ⛔ No inventes datos: ni cifras, ni nombres de personas, ni sistemas que la propuesta no nombra. Si un texto necesita un dato que no tienes, escríbelo sin ese dato y anótalo en "notas".
- ⛔ No cambies montos, precios ni porcentajes de dinero: anótalos en "notas" para que Ventas los revise.
- Mantén el largo parecido al original (±30 %): el texto vive en un diseño que no se mueve. Un rótulo corto sigue siendo corto.
- No agregues HTML, etiquetas ni Markdown: solo texto.
- Mismo idioma que el original. En español, tuteo neutro; nunca voseo.

Devuelve SOLO un objeto JSON, sin texto alrededor:
{"cambios":[{"id":3,"texto":"el texto nuevo"}],"notas":["lo que Ventas tiene que revisar a mano"]}`;

/** El mensaje del pedido: el contexto de la empresa nueva y los textos numerados. */
export function armarPedidoDeAdaptacion(ctx: ContextoDeAdaptacion, segmentos: readonly SegmentoDeTexto[]): string {
  const lineas = segmentos.map((s) => JSON.stringify({ id: s.id, t: s.texto }));
  return [
    `EMPRESA NUEVA: ${ctx.clienteNuevo}`,
    ctx.clienteOrigen ? `EMPRESA PARA LA QUE SE ARMÓ: ${ctx.clienteOrigen}` : "EMPRESA PARA LA QUE SE ARMÓ: no se sabe — reconócela por los textos.",
    ctx.avisos ? `AL GUARDARLO SE ENCONTRÓ: ${ctx.avisos}` : "",
    ctx.lang && !ctx.lang.toLowerCase().startsWith("es") ? `IDIOMA DE LA PROPUESTA: ${ctx.lang}` : "",
    "",
    "LO QUE DICE LA PROPUESTA DE LA EMPRESA NUEVA:",
    ctx.propuesta.trim() || "(la propuesta todavía no tiene contenido: cambia solo el nombre de la empresa)",
    "",
    "TEXTOS DE LA SECCIÓN (uno por línea, {id, t}):",
    ...lineas,
  ]
    .filter((l, i, arr) => l !== "" || arr[i - 1] !== "")
    .join("\n");
}

/** Saca el primer objeto JSON del texto del modelo (tolera un cerco de Markdown alrededor). */
function primerObjeto(texto: string): Record<string, unknown> | null {
  const limpio = texto.replace(/```(?:json)?/g, "");
  const ini = limpio.indexOf("{");
  const fin = limpio.lastIndexOf("}");
  if (ini === -1 || fin <= ini) return null;
  try {
    const v = JSON.parse(limpio.slice(ini, fin + 1));
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Lee la respuesta del modelo y la convierte en una propuesta revisable.
 *
 * ⛔ Se descarta, sin preguntar: un id que no existe, un texto vacío, uno igual al de antes y uno
 * con etiquetas (`<`): la regla es que el diseño no se toca, y una etiqueta adentro de un texto es
 * diseño. Lo que trae voseo se queda, marcado: lo decide la persona.
 */
export function leerRespuestaDeAdaptacion(
  texto: string,
  segmentos: readonly SegmentoDeTexto[],
  sinRevisar = 0,
): PropuestaDeAdaptacion {
  const obj = primerObjeto(texto);
  const porId = new Map(segmentos.map((s) => [s.id, s]));
  const vistos = new Set<number>();
  const cambios: CambioPropuesto[] = [];
  for (const c of Array.isArray(obj?.cambios) ? obj.cambios : []) {
    const x = c as { id?: unknown; texto?: unknown };
    const id = typeof x.id === "number" ? x.id : Number(x.id);
    const seg = Number.isInteger(id) ? porId.get(id) : undefined;
    const despues = typeof x.texto === "string" ? x.texto.trim() : "";
    if (!seg || vistos.has(id) || !despues || despues === seg.texto.trim() || /[<>]/.test(despues)) continue;
    vistos.add(id);
    // Conserva los espacios del original alrededor (en un rótulo pueden importar).
    const lead = seg.texto.match(/^\s*/)?.[0] ?? "";
    const trail = seg.texto.match(/\s*$/)?.[0] ?? "";
    const voseo = voseoEnProsa(despues);
    cambios.push({
      id,
      antes: seg.texto,
      despues: `${lead}${despues}${trail}`,
      ...(voseo.length ? { aviso: `Revisa el voseo: ${voseo.slice(0, 3).join(", ")}` } : {}),
    });
  }
  const notas = (Array.isArray(obj?.notas) ? obj.notas : [])
    .filter((n): n is string => typeof n === "string" && n.trim().length > 0)
    .map((n) => n.trim())
    .slice(0, 8);
  return { cambios: cambios.sort((a, b) => a.id - b.id), notas, sinRevisar };
}

/** Lo elegido, listo para `aplicarTextos`: solo los ids marcados. */
export function cambiosElegidos(propuesta: PropuestaDeAdaptacion, elegidos: ReadonlySet<number>): Map<number, string> {
  return new Map(propuesta.cambios.filter((c) => elegidos.has(c.id)).map((c) => [c.id, c.despues]));
}

/** Las secciones de la propuesta que dicen QUIÉN es el cliente nuevo, en orden de peso. */
const SECCIONES_DEL_CONTEXTO = ["hero", "dolores", "solucion", "antes_despues", "web_diagnosis", "roi"] as const;

/** Tope del resumen de la propuesta que acompaña al pedido. */
export const MAX_CONTEXTO_DE_LA_PROPUESTA = 4_000;

function hojas(v: unknown, out: string[]): void {
  if (typeof v === "string") {
    if (v.trim()) out.push(v.trim());
  } else if (Array.isArray(v)) {
    for (const x of v) hojas(x, out);
  } else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      // Lo que no es texto del cliente: URLs de imagen, marcas de la portada, el idioma.
      if (k.startsWith("__") || /url|brands|logo/i.test(k)) continue;
      hojas(x, out);
    }
  }
}

/**
 * Lo que dice la propuesta del cliente nuevo, en texto corrido: portada, dolores, solución.
 *
 * ⚠ Solo esas secciones y con tope: es contexto para reconocer a la empresa, no la propuesta
 * entera. Y nunca la Inversión: un monto de esta propuesta no tiene por qué terminar en el módulo.
 */
export function resumenDeLaPropuesta(secciones: ReadonlyArray<{ key: string; data: unknown }>): string {
  const porKey = new Map(secciones.map((s) => [s.key, s.data]));
  const partes: string[] = [];
  for (const key of SECCIONES_DEL_CONTEXTO) {
    const out: string[] = [];
    hojas(porKey.get(key), out);
    if (out.length) partes.push(`[${key}] ${out.join(" · ")}`);
  }
  const todo = partes.join("\n");
  return todo.length > MAX_CONTEXTO_DE_LA_PROPUESTA ? `${todo.slice(0, MAX_CONTEXTO_DE_LA_PROPUESTA)}…` : todo;
}
