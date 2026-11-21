/**
 * lib/seguimiento/quien-lo-dijo.ts — QUIÉN DIJO LO QUE UN HECHO LE LLEVA A UN DOCUMENTO DEL CLIENTE (2026-11-20). PURO y
 * client-safe.
 *
 * Medido en 21 reuniones reales: de 48 hechos que iban a documentos del cliente, 28 tenían solo una cita de Smarteam, y en
 * una presentación de diagnóstico el propio diagnóstico volvía como «el cliente quiere…». Elías decidió: a un documento
 * del cliente llega con cita del cliente, o rotulado «Lo dijo Smarteam» (el mismo criterio de rótulo de las notas del
 * equipo, que también llegan con quién las dijo). Ver docs/DECISIONS.md «Hechos, enrutador y novedades».
 *
 * Sale de lo guardado: `HechoDeReunion.quien` solo vale cuando lo comprobó el turno de la transcripción (si no, null), y
 * `citaFuente` dice si la cita es de la transcripción, de las notas de Gemini o de un texto sumado a mano.
 */

export type QuienLoDijo = "cliente" | "smarteam" | "sin_comprobar";

/** Del cliente solo con su turno comprobado en la transcripción (la misma vara que `loDijoElCliente`). */
export function quienLoDijo(h: { quien?: string | null; citaFuente?: string | null }): QuienLoDijo {
  if (h.quien === "cliente" && h.citaFuente === "transcripcion") return "cliente";
  if (h.quien === "smarteam") return "smarteam";
  return "sin_comprobar";
}

/** El rótulo que acompaña a la cita cuando no es del cliente. */
export const ROTULO_DE_QUIEN_LO_DIJO: Readonly<Record<Exclude<QuienLoDijo, "cliente">, string>> = {
  smarteam: "Lo dijo Smarteam",
  sin_comprobar: "No se comprobó quién lo dijo",
};

/** El rótulo, o null si lo dijo el cliente. */
export function rotuloDeQuienLoDijo(q: QuienLoDijo): string | null {
  return q === "cliente" ? null : ROTULO_DE_QUIEN_LO_DIJO[q];
}

/**
 * Lo que se le dice al chat del documento cuando la novedad no la dijo el cliente: que no la escriba como algo que el
 * cliente quiere, pidió o aceptó. Una sola línea (va dentro del bloque de alcance, que se cierra con una línea en blanco).
 */
export function avisoParaElChat(q: QuienLoDijo): string {
  if (q === "smarteam")
    return "Esto lo dijo Smarteam, no el cliente: no lo escribas como algo que el cliente quiere, pidió o aceptó; si entra, que se lea como lo que propone Smarteam.\n";
  if (q === "sin_comprobar")
    return "No se comprobó quién lo dijo (puede ser de Smarteam): no lo escribas como algo que el cliente quiere, pidió o aceptó.\n";
  return "";
}
