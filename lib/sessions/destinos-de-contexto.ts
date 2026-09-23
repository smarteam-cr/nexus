/**
 * lib/sessions/destinos-de-contexto.ts — EL MISMO PANEL, DOS DESTINOS.
 *
 * El panel de «Contexto» (Google Meet: qué reuniones alimentan, cuáles se sacaron, buscar más) sirve
 * desde el 2026-09-23 a DOS documentos: el HANDOFF y el CRONOGRAMA. Son la misma pantalla con dos
 * reglas distintas, y lo que cambia entre uno y otro vive ACÁ, puro y con test — para que la ruta y
 * el componente no terminen con `if (destino === ...)` desparramados que un día dicen cosas
 * distintas sobre la misma reunión.
 *
 * ── LO QUE CAMBIA ────────────────────────────────────────────────────────────
 *  · HANDOFF: la política del link (`linkFeedsHandoff`: primario / confianza alta / forzada) + la
 *    regla de relevancia por título o Ventas en la sala. El afinado humano es `handoffOverride`.
 *  · CRONOGRAMA: TODA reunión del proyecto, sin regla de relevancia (`linkFeedsTimeline`). El
 *    afinado humano es `timelineOverride`. La regla del handoff NO aplica: descarta justo las
 *    reuniones de implementación, las semanales y las de revisión, que son las del cronograma.
 */
import { linkFeedsHandoff } from "@/lib/handoff/session-relevance";
import { linkFeedsTimeline } from "@/lib/timeline/session-feeding";

export type DestinoDeContexto = "handoff" | "cronograma";

/** `?para=` de la ruta. Cualquier otra cosa es el handoff: es el destino histórico. */
export function parseDestino(v: string | null | undefined): DestinoDeContexto {
  return v === "cronograma" ? "cronograma" : "handoff";
}

/** Lo mínimo del vínculo sesión↔proyecto que miran las reglas de los dos destinos. */
export interface VinculoDelPanel {
  included: boolean;
  isPrimary: boolean;
  confidence: number | null;
  handoffOverride: boolean | null;
  timelineOverride: boolean | null;
}

/** El afinado humano del destino: la X (`false`) o «Agregar» (`true`). */
function afinado(destino: DestinoDeContexto, v: VinculoDelPanel): boolean | null {
  return destino === "cronograma" ? v.timelineOverride : v.handoffOverride;
}

/**
 * ¿Este vínculo alimenta el documento del destino?
 *
 * @param aplicaReglaHandoff el veredicto de `classifyHandoffSession` para la reunión. Solo lo
 *   consulta el HANDOFF; el cronograma no tiene regla de relevancia.
 */
export function alimenta(destino: DestinoDeContexto, v: VinculoDelPanel, aplicaReglaHandoff: boolean): boolean {
  if (destino === "cronograma") return linkFeedsTimeline(v);
  // Excluida de la membresía del proyecto (tombstone humano) no alimenta NADA.
  return (
    v.included &&
    linkFeedsHandoff(
      { isPrimary: v.isPrimary, confidence: v.confidence, handoffOverride: v.handoffOverride },
      aplicaReglaHandoff,
    )
  );
}

/** La sacó un humano de ESTE documento (sigue siendo del proyecto). */
export function excluidaAMano(destino: DestinoDeContexto, v: VinculoDelPanel): boolean {
  return v.included && afinado(destino, v) === false;
}

/** La agregó un humano a ESTE documento. */
export function forzadaAMano(destino: DestinoDeContexto, v: VinculoDelPanel): boolean {
  return afinado(destino, v) === true;
}

/** Por qué alimenta, en palabras: la fila del panel lo muestra. */
export function origenDelVinculo(destino: DestinoDeContexto, v: VinculoDelPanel): string {
  if (forzadaAMano(destino, v)) return destino === "cronograma" ? "agregada a mano" : "forzada a mano";
  if (destino === "cronograma") return "reunión del proyecto";
  return v.isPrimary ? "primaria" : "confianza alta";
}

/** ¿El destino usa la regla de relevancia por título (y el chip «aplica» del buscador)? */
export function usaReglaDeRelevancia(destino: DestinoDeContexto): boolean {
  return destino === "handoff";
}
