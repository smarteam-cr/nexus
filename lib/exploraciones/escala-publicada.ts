/**
 * lib/exploraciones/escala-publicada.ts — la FOTO de la escala que ve el cliente (16 nov; Elías: «hay que publicarlo
 * actualizado»). Puro: el formato con que se guarda y cómo se compara con lo de hoy.
 *
 * Hasta el 16 nov la página del enlace leía lo medido en cada visita: un nivel arrastrado o un texto a medio corregir lo
 * veía el cliente al recargar. Ahora el cliente ve lo que se PUBLICÓ (`AccesoALaEscala.publicada`): adentro se edita
 * tranquilo y «Publicar» lo lleva afuera. La foto es la página entera (`EscalaParaElCliente`, sin citas), con los textos
 * cambiados adentro.
 *
 * `FORMATO_DE_LA_FOTO`: súbelo cuando cambie la FORMA de `EscalaParaElCliente` (un campo nuevo que la vista necesita, uno
 * que cambia de tipo). Una foto de otro formato no se sirve: la página dice «Tu escala todavía no está lista» hasta que
 * alguien publique de nuevo. Pintar una foto vieja con la vista nueva podía romper la página del cliente sin aviso.
 */
import type { EscalaParaElCliente } from "./escala-para-el-cliente-server";

export const FORMATO_DE_LA_FOTO = 1;

export interface FotoDeLaEscala {
  formato: number;
  pagina: EscalaParaElCliente;
}

export function fotoDe(pagina: EscalaParaElCliente): FotoDeLaEscala {
  return { formato: FORMATO_DE_LA_FOTO, pagina };
}

const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/** La página de una foto guardada, si es del formato de hoy y tiene la forma mínima. null: no se sirve. */
export function paginaDeLaFoto(raw: unknown): EscalaParaElCliente | null {
  if (!esObjeto(raw) || raw.formato !== FORMATO_DE_LA_FOTO || !esObjeto(raw.pagina)) return null;
  const p = raw.pagina;
  if (typeof p.empresa !== "string" || !Array.isArray(p.areas) || !Array.isArray(p.resultados) || !esObjeto(p.resumen)) return null;
  // Una foto de antes de un campo nuevo que no cambia la forma de lo demás: lo que falta, vacío.
  return { ...(p as unknown as EscalaParaElCliente), textos: esObjeto(p.textos) ? (p.textos as Record<string, string>) : {} };
}

/**
 * El texto de un valor con las claves en orden: Postgres (JSONB) guarda los objetos con otro orden de claves, así que
 * comparar el JSON tal cual daría «cambiado» siempre. Lo que JSON no guarda (undefined) tampoco cuenta.
 */
export function jsonEnOrden(x: unknown): string {
  return JSON.stringify(x, (_k, v: unknown) =>
    esObjeto(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, v[k]]),
        )
      : v,
  );
}

/**
 * Lo que la comparación no mira de cada resultado: el vistazo de cada nivel (la tarjeta de la escalera, 21 nov) es texto
 * de la escala, no de la empresa, y la página del enlace lo completa con la escala de hoy. Contarlo marcaba «cambios» en
 * todas las fotos publicadas antes de que existiera.
 */
const sinVistazos = (p: EscalaParaElCliente): EscalaParaElCliente => ({
  ...p,
  resultados: p.resultados.map((r) => ({ ...r, niveles: r.niveles.map(({ letra, nombre }) => ({ letra, nombre })) })),
});

/**
 * Si lo de hoy es lo que ya está publicado. La fecha del pie no cuenta: sin niveles confirmados sale de la última vez que
 * se guardó cualquier cosa de la exploración (un contexto que el cliente no ve), y avisaba cambios que no había. El vistazo
 * de cada nivel tampoco (`sinVistazos`).
 */
export function mismaPagina(a: EscalaParaElCliente, b: EscalaParaElCliente): boolean {
  return jsonEnOrden({ ...sinVistazos(a), fecha: null }) === jsonEnOrden({ ...sinVistazos(b), fecha: null });
}
