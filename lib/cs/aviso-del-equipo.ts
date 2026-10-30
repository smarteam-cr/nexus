/**
 * lib/cs/aviso-del-equipo.ts — una «queja» que en la reunión levantó alguien de Smarteam es un AVISO DEL EQUIPO. PURO
 * (2026-10-29).
 *
 * Pedido de Elías del 29 oct: «que Nexus distinga entre una queja del cliente y una alerta que levantó nuestro propio
 * equipo. Hoy marcó en kölbi una "queja del cliente" en la revisión de campañas, pero en realidad fuimos nosotros
 * quienes avisamos que había desorden». La frase («ellos nos han manifestado mucho que no hay una rutina…») la dijo
 * Valentina Sandoval, de Smarteam; el vigía la tomó por el cliente porque el equipo la tiene como «Valentina Sandoval
 * Devia» y la regla pedía el último apellido (arreglado en `hablanteDelEquipo`).
 *
 * Antes, una queja del vigía en el turno de alguien del equipo quedaba como queja sin verificar (se veía igual, como
 * «queja»). Ahora se guarda como `AVISO_DEL_EQUIPO`: dice quién la levantó, conserva la frase verificada y NO pinta el
 * color (no está en `CATEGORIAS_QUE_PINTAN`): lo que avisa el equipo es contexto para la CSL, no una queja del cliente.
 */

export const AVISO_DEL_EQUIPO = "AVISO_DEL_EQUIPO" as const;

const TOPE_DEL_TITULO = 140;

/** Los arranques con que el vigía y la lectura titulan una queja («Queja del cliente: …», «Cliente: …»). */
const PREFIJO_DE_QUEJA = /^\s*(queja(\s+del\s+cliente)?|cliente|el\s+cliente)\s*[:—–-]\s*/i;

function recortar(s: string, tope: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > tope ? `${t.slice(0, tope - 1).trimEnd()}…` : t;
}

/** El título como aviso: sin el «Queja del cliente:» del principio, con «Aviso del equipo:». */
export function tituloDeAviso(titulo: string): string {
  const resto = titulo.replace(PREFIJO_DE_QUEJA, "").trim();
  const conMayuscula = resto ? `${resto.charAt(0).toUpperCase()}${resto.slice(1)}` : "Lo avisó alguien de Smarteam en la reunión";
  return recortar(`Aviso del equipo: ${conMayuscula}`, TOPE_DEL_TITULO);
}

/** El porqué del aviso: quién lo levantó y su frase. El texto del detector decía «queja del cliente»: no se conserva. */
export function razonDeAviso(frase: string, hablante: string | null): string {
  const quien = hablante?.trim() ? `${hablante.trim()}, de Smarteam,` : "Alguien de Smarteam";
  return `Lo levantó ${quien} en la reunión: es un aviso del equipo, no una queja del cliente. Dijo: «${frase.trim()}»`;
}

export const ACCION_DEL_AVISO = "Pregúntale a quien lo levantó qué vio y decidan si hay algo que conversar con el cliente.";

/**
 * Cómo queda la alerta del vigía después de buscar su frase. La frase apareció (`verificada`) y la dijo alguien de
 * Smarteam (`avisoDe`): aviso del equipo, con la frase y quién la dijo. Apareció y no: la alerta con su frase verificada.
 * No apareció: `citaSinVerificar`, y se ve igual sin pintar.
 */
export function alertaConLaCita<A extends { category: string; title: string; reason: string; suggestedAction: string | null; evidence: Record<string, unknown> }>(
  a: A,
  o: { evidencia: Record<string, unknown>; textoPedido: string; verificada: Record<string, unknown> | null; avisoDe: string | null },
): A {
  if (o.verificada && o.avisoDe) {
    return comoAvisoDelEquipo({ ...a, evidence: { ...o.evidencia, cita: { ...o.verificada, verificada: true, dichaPor: o.avisoDe } } }, o.avisoDe, o.textoPedido);
  }
  return {
    ...a,
    evidence: o.verificada ? { ...o.evidencia, cita: { ...o.verificada, verificada: true } } : { ...o.evidencia, citaSinVerificar: o.textoPedido },
  };
}

/** Una queja leída como aviso del equipo: categoría, título, porqué y acción. El resto de la alerta queda igual. */
export function comoAvisoDelEquipo<A extends { category: string; title: string; reason: string }>(
  a: A,
  hablante: string | null,
  frase: string,
): A & { category: typeof AVISO_DEL_EQUIPO; suggestedAction: string } {
  return { ...a, category: AVISO_DEL_EQUIPO, title: tituloDeAviso(a.title), reason: razonDeAviso(frase, hablante), suggestedAction: ACCION_DEL_AVISO };
}
