/**
 * lib/sessions/destinos-de-contexto.ts — EL MISMO PANEL, TRES DESTINOS.
 *
 * El panel de «Contexto» (Google Meet: qué reuniones alimentan, cuáles se sacaron, buscar más) sirve
 * a TRES documentos: el HANDOFF, el CRONOGRAMA (desde el 2026-09-23) y el DIAGNÓSTICO (desde el
 * 2026-09-28). Son la misma pantalla con reglas distintas, y lo que cambia entre uno y otro vive ACÁ,
 * puro y con test — para que la ruta y el componente no terminen con `if (destino === ...)`
 * desparramados que un día dicen cosas distintas sobre la misma reunión.
 *
 * ── LO QUE CAMBIA ────────────────────────────────────────────────────────────
 *  · HANDOFF: la política del link (`linkFeedsHandoff`: primario / confianza alta / forzada) + la
 *    regla de relevancia por título o Ventas en la sala. El afinado humano es `handoffOverride`.
 *  · CRONOGRAMA: SOLO las reuniones que el CSE eligió (`linkFeedsTimeline`, `timelineOverride=true`),
 *    sin regla de relevancia. La regla del handoff NO aplica: descarta justo las reuniones de
 *    implementación, las semanales y las de revisión, que son las del cronograma. Tampoco hay lista
 *    de «excluidas»: sacar una es dejar de elegirla, y vuelve a la lista de reuniones del proyecto
 *    del buscador (2026-09-23, segunda versión).
 *  · DIAGNÓSTICO: arranca SUGERIDO (decisión de Elías, 2026-09-28) — toda reunión del proyecto CON
 *    EL CLIENTE alimenta, sin que nadie la elija. El CSE saca las que no sirven (la X, `false`) o
 *    agrega otras (`true`). Si arrancara vacío como el cronograma, el primer diagnóstico saldría sin
 *    reuniones cada vez que el CSE se olvida de elegir. «Con el cliente» es la misma etiqueta que
 *    usan los agentes (`etiquetaDeSala`); una reunión sin participantes registrados no se sugiere.
 *  · PLANIFICACIÓN y EJECUCIÓN (2026-09-29): la misma regla sugerida que el diagnóstico, cada una
 *    con su propia columna — sacar una reunión de un documento no la saca de los otros.
 *  · KICKOFF, EXPLORACIÓN, INTEGRACIONES y ENTREGA (2026-10-07, «el contexto adicional es de cada
 *    artefacto»): la misma regla sugerida, cada uno con su columna.
 */
import { linkFeedsHandoff } from "@/lib/handoff/session-relevance";
import { linkFeedsTimeline } from "@/lib/timeline/session-feeding";

export type DestinoDeContexto =
  | "handoff"
  | "cronograma"
  | "diagnostico"
  | "planificacion"
  | "ejecucion"
  | "kickoff"
  | "exploracion"
  | "integraciones"
  | "entrega";

/**
 * Los destinos que arrancan SUGERIDOS (diagnóstico desde el 2026-09-28; planificación y ejecución
 * desde el 2026-09-29): toda reunión del proyecto con el cliente alimenta sin que nadie la elija, y
 * cada uno guarda su propio afinado en su columna de `SessionProject`.
 */
export const DESTINOS_SUGERIDOS = [
  "diagnostico",
  "planificacion",
  "ejecucion",
  "kickoff",
  "exploracion",
  "integraciones",
  "entrega",
] as const;
export type DestinoSugerido = (typeof DESTINOS_SUGERIDOS)[number];

export function esDestinoSugerido(d: DestinoDeContexto): d is DestinoSugerido {
  return (DESTINOS_SUGERIDOS as readonly string[]).includes(d);
}

/** La columna de `SessionProject` donde cada destino sugerido guarda la X o el «Agregar». */
export const COLUMNA_DEL_DESTINO = {
  diagnostico: "diagnosisOverride",
  planificacion: "planningOverride",
  ejecucion: "implementationOverride",
  kickoff: "kickoffOverride",
  exploracion: "explorationOverride",
  integraciones: "techRequirementsOverride",
  entrega: "deliveryOverride",
} as const satisfies Record<DestinoSugerido, string>;

/** `?para=` de la ruta. Cualquier otra cosa es el handoff: es el destino histórico. */
export function parseDestino(v: string | null | undefined): DestinoDeContexto {
  return v === "cronograma" || (v != null && (DESTINOS_SUGERIDOS as readonly string[]).includes(v))
    ? (v as DestinoDeContexto)
    : "handoff";
}

/** Lo mínimo del vínculo sesión↔proyecto que miran las reglas de los destinos. */
export interface VinculoDelPanel {
  included: boolean;
  isPrimary: boolean;
  confidence: number | null;
  handoffOverride: boolean | null;
  timelineOverride: boolean | null;
  diagnosisOverride: boolean | null;
  planningOverride: boolean | null;
  implementationOverride: boolean | null;
  kickoffOverride: boolean | null;
  explorationOverride: boolean | null;
  techRequirementsOverride: boolean | null;
  deliveryOverride: boolean | null;
}

/** El afinado humano del destino: la X (`false`) o «Agregar» (`true`). */
function afinado(destino: DestinoDeContexto, v: VinculoDelPanel): boolean | null {
  if (destino === "cronograma") return v.timelineOverride;
  if (esDestinoSugerido(destino)) return v[COLUMNA_DEL_DESTINO[destino]];
  return v.handoffOverride;
}

/**
 * La regla de los destinos SUGERIDOS, sola: agregada a mano entra, sacada no, y sin tocar entra si
 * es con el cliente. La usan el panel (vía `alimenta`) y los runners (vía `getProjectDocumentSessions`).
 */
export function linkFeedsDocumento(v: { included: boolean; override: boolean | null }, conElCliente: boolean): boolean {
  if (!v.included) return false;
  if (v.override !== null) return v.override;
  return conElCliente;
}

/** La del diagnóstico, con su nombre de siempre (mismo resultado que `linkFeedsDocumento`). */
export function linkFeedsDiagnosis(
  v: { included: boolean; diagnosisOverride: boolean | null },
  conElCliente: boolean,
): boolean {
  return linkFeedsDocumento({ included: v.included, override: v.diagnosisOverride }, conElCliente);
}

/**
 * ¿Este vínculo alimenta el documento del destino?
 *
 * @param aplica el veredicto de la regla PROPIA del destino para esa reunión: en el HANDOFF,
 *   `classifyHandoffSession`; en los SUGERIDOS, «¿fue con el cliente?». El cronograma no tiene regla.
 */
export function alimenta(destino: DestinoDeContexto, v: VinculoDelPanel, aplica: boolean): boolean {
  if (destino === "cronograma") return linkFeedsTimeline(v);
  if (esDestinoSugerido(destino)) {
    return linkFeedsDocumento({ included: v.included, override: v[COLUMNA_DEL_DESTINO[destino]] }, aplica);
  }
  // Excluida de la membresía del proyecto (tombstone humano) no alimenta NADA.
  return (
    v.included &&
    linkFeedsHandoff(
      { isPrimary: v.isPrimary, confidence: v.confidence, handoffOverride: v.handoffOverride },
      aplica,
    )
  );
}

/**
 * La sacó un humano de ESTE documento (sigue siendo del proyecto).
 *
 * En el cronograma no existe: ahí se elige lo que entra, y sacar una es dejar de elegirla — vuelve
 * al buscador como cualquier otra reunión del proyecto. Un `false` que haya quedado de la primera
 * versión se lee igual que `null`.
 */
export function excluidaAMano(destino: DestinoDeContexto, v: VinculoDelPanel): boolean {
  if (destino === "cronograma") return false;
  return v.included && afinado(destino, v) === false;
}

/** La agregó (o en el cronograma, la eligió) un humano para ESTE documento. */
export function forzadaAMano(destino: DestinoDeContexto, v: VinculoDelPanel): boolean {
  return afinado(destino, v) === true;
}

/** Por qué alimenta, en palabras: la fila del panel lo muestra. */
export function origenDelVinculo(destino: DestinoDeContexto, v: VinculoDelPanel): string {
  // En el cronograma solo alimenta la elegida, así que el porqué es siempre el mismo.
  if (destino === "cronograma") return "elegida para el cronograma";
  if (esDestinoSugerido(destino)) return forzadaAMano(destino, v) ? "agregada a mano" : "sugerida: reunión con el cliente";
  if (forzadaAMano(destino, v)) return "forzada a mano";
  return v.isPrimary ? "primaria" : "confianza alta";
}

/** ¿El destino usa la regla de relevancia por título (y el chip «aplica» del buscador)? */
export function usaReglaDeRelevancia(destino: DestinoDeContexto): boolean {
  return destino === "handoff";
}

/** ¿El destino sugiere solo, por «reunión con el cliente»? */
export function sugiereConElCliente(destino: DestinoDeContexto): boolean {
  return esDestinoSugerido(destino);
}
