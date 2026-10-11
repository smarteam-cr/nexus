/**
 * lib/sessions/destinos-de-contexto.ts — EL MISMO PANEL, VARIOS DESTINOS.
 *
 * El panel de «Contexto» (Google Meet: qué reuniones alimentan, cuáles se sacaron, buscar más) sirve
 * al HANDOFF, al CRONOGRAMA (desde el 2026-09-23) y a los DOCUMENTOS del proyecto (desde el
 * 2026-09-28). Son la misma pantalla con reglas distintas, y lo que cambia entre uno y otro vive ACÁ,
 * puro y con test — para que la ruta y el componente no terminen con `if (destino === ...)`
 * desparramados que un día dicen cosas distintas sobre la misma reunión. El lector de cada documento
 * (`getProjectDocumentSessions`) usa la MISMA regla: lo que el panel dice que alimenta es lo que se lee.
 *
 * ── LO QUE CAMBIA ────────────────────────────────────────────────────────────
 *  · HANDOFF: la política del link (`linkFeedsHandoff`: primario / confianza alta / forzada) + la
 *    regla de relevancia por título o Ventas en la sala. El afinado humano es `handoffOverride`.
 *  · CRONOGRAMA: SOLO las reuniones que el CSE eligió (`linkFeedsTimeline`, `timelineOverride=true`),
 *    sin regla de relevancia. La regla del handoff NO aplica: descarta justo las reuniones de
 *    implementación, las semanales y las de revisión, que son las del cronograma. Tampoco hay lista
 *    de «excluidas»: sacar una es dejar de elegirla, y vuelve a la lista de reuniones del proyecto
 *    del buscador (2026-09-23, segunda versión).
 *  · LOS SEIS DOCUMENTOS (`DESTINOS_SOLO_ELEGIDAS`: diagnóstico, planificación, ejecución, kickoff,
 *    integraciones y entrega) — SOLO LAS ELEGIDAS desde la etapa 7 de la memoria de la cuenta
 *    (DECISIONS «Los documentos leen la memoria y solo las reuniones elegidas», 2026-10-09). Igual que
 *    el cronograma: una reunión sin tocar NO entra; entra la que una persona eligió (`true`, cada
 *    documento en su columna: sacarla de uno no la saca de los otros). La X sobre una elegida vuelve a
 *    `null`, como en el cronograma, y no hay lista de «excluidas». `false` = «Nexus la sugirió y la
 *    desestimaste» (`desestimadaPorElCse`): no entra y no pone candado (session-project-locks.ts); un
 *    `false` de antes (la X sobre una sugerida) se lee igual: la persona la sacó.
 *      Hasta entonces arrancaban SUGERIDOS (diagnóstico desde el 2026-09-28, planificación y ejecución
 *    desde el 2026-09-29, el resto desde el 2026-10-07): toda reunión del proyecto con el cliente
 *    entraba sin que nadie la eligiera. La razón era «si arrancara vacío, el primer diagnóstico
 *    saldría sin reuniones cada vez que el CSE se olvida de elegir». DECISIONS la contesta: con la
 *    memoria del proyecto (lib/memoria) un documento sin elegidas ya no sale vacío, y el modo
 *    sugerido metía por defecto las llamadas de venta, con precios, en documentos que ve el cliente.
 *    Lo que hacía el modo sugerido lo hacen las SUGERENCIAS CALCULADAS (se calculan al leer y nunca
 *    escriben `true` solas: `true` es el candado humano); «Usar» es el clic de una persona y escribe
 *    `true`.
 *  · ⚠ EXPLORACIÓN: sigue con la regla sugerida (`linkFeedsExploracion`) hasta salir de este módulo.
 *    Desde la etapa A (2026-10-09) la exploración nueva ya NO lee esta columna: lee solo la reunión de
 *    cada una de sus sesiones (lib/exploraciones/fuentes.ts). Queda por los tipos de
 *    `guardContextoDelDocumento` y por la guía vieja (lib/guia-exploracion/servidor.ts);
 *    `explorationOverride` queda DEPRECATED (sin DROP) y sale en la limpieza de la etapa 0, después de
 *    scripts/migrar-guia-de-exploracion.ts.
 */
import { documentoDelDestino } from "@/lib/contexto/documento";
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
 * Los destinos de los DOCUMENTOS del proyecto (lib/contexto/documento.ts): cada uno guarda su propio
 * afinado en su columna de `SessionProject`. Qué regla lee cada uno lo dice `DESTINOS_SOLO_ELEGIDAS`.
 */
export const DESTINOS_DE_DOCUMENTO = [
  "diagnostico",
  "planificacion",
  "ejecucion",
  "kickoff",
  "exploracion",
  "integraciones",
  "entrega",
] as const;
export type DestinoDeDocumento = (typeof DESTINOS_DE_DOCUMENTO)[number];
/** @deprecated (etapa 7): desde que los documentos leen solo las elegidas, el nombre engaña. Usa `DestinoDeDocumento`. */
export type DestinoSugerido = DestinoDeDocumento;

/**
 * Los documentos que leen SOLO LAS ELEGIDAS (etapa 7, 2026-10): todos menos la exploración, que
 * conserva su regla sugerida hasta salir del módulo (etapa A).
 */
export const DESTINOS_SOLO_ELEGIDAS = [
  "diagnostico",
  "planificacion",
  "ejecucion",
  "kickoff",
  "integraciones",
  "entrega",
] as const satisfies readonly DestinoDeDocumento[];
export type DestinoSoloElegidas = (typeof DESTINOS_SOLO_ELEGIDAS)[number];

export function esDestinoDeDocumento(d: DestinoDeContexto): d is DestinoDeDocumento {
  return (DESTINOS_DE_DOCUMENTO as readonly string[]).includes(d);
}

export function esSoloElegidas(d: DestinoDeContexto): d is DestinoSoloElegidas {
  return (DESTINOS_SOLO_ELEGIDAS as readonly string[]).includes(d);
}

/** La columna de `SessionProject` donde cada documento guarda su afinado: elegida, sacada o desestimada. */
export const COLUMNA_DEL_DESTINO = {
  diagnostico: "diagnosisOverride",
  planificacion: "planningOverride",
  ejecucion: "implementationOverride",
  kickoff: "kickoffOverride",
  /** @deprecated (etapa A, 2026-10-09): la exploración nueva no la lee; queda por la guía vieja. */
  exploracion: "explorationOverride",
  integraciones: "techRequirementsOverride",
  entrega: "deliveryOverride",
} as const satisfies Record<DestinoDeDocumento, string>;

/** `?para=` de la ruta. Cualquier otra cosa es el handoff: es el destino histórico. */
export function parseDestino(v: string | null | undefined): DestinoDeContexto {
  return v === "cronograma" || (v != null && (DESTINOS_DE_DOCUMENTO as readonly string[]).includes(v))
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

/** El afinado humano del destino: `true` (elegida o agregada), `false` (sacada o desestimada) o `null` (sin tocar). */
function afinado(destino: DestinoDeContexto, v: VinculoDelPanel): boolean | null {
  if (destino === "cronograma") return v.timelineOverride;
  if (esDestinoDeDocumento(destino)) return v[COLUMNA_DEL_DESTINO[destino]];
  return v.handoffOverride;
}

/**
 * La regla de los SEIS DOCUMENTOS (etapa 7), sola: entra SOLO la que eligió una persona (`true`).
 * Sin tocar (`null`) no entra, desestimada (`false`) tampoco, y el tombstone (`included: false`) manda
 * sobre todo. La usan el panel (vía `alimenta`) y el lector (vía `getProjectDocumentSessions`).
 */
export function linkFeedsDocumento(v: { included: boolean; override: boolean | null }): boolean {
  return v.included && v.override === true;
}

/**
 * La regla SUGERIDA de antes, que conserva solo la EXPLORACIÓN mientras siga en este módulo:
 * agregada a mano entra, sacada no, y sin tocar entra si es con el cliente.
 */
export function linkFeedsExploracion(v: { included: boolean; override: boolean | null }, conElCliente: boolean): boolean {
  if (!v.included) return false;
  if (v.override !== null) return v.override;
  return conElCliente;
}

/**
 * ¿Este vínculo alimenta el documento del destino?
 *
 * @param aplica el veredicto de la regla PROPIA del destino para esa reunión: en el HANDOFF,
 *   `classifyHandoffSession`; en la EXPLORACIÓN, «¿fue con el cliente?». El cronograma y los seis
 *   documentos no tienen regla: entra lo elegido.
 */
export function alimenta(destino: DestinoDeContexto, v: VinculoDelPanel, aplica: boolean): boolean {
  if (destino === "cronograma") return linkFeedsTimeline(v);
  if (esSoloElegidas(destino)) {
    return linkFeedsDocumento({ included: v.included, override: v[COLUMNA_DEL_DESTINO[destino]] });
  }
  if (destino === "exploracion") {
    return linkFeedsExploracion({ included: v.included, override: v.explorationOverride }, aplica);
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
 * La sacó un humano de ESTE documento (sigue siendo del proyecto) y se muestra como «Excluida».
 *
 * En el cronograma y en los seis documentos no existe: ahí se elige lo que entra, y sacar una es
 * dejar de elegirla — vuelve al buscador como cualquier otra reunión del proyecto. Un `false` que
 * haya quedado de antes se lee como desestimada (`desestimadaPorElCse`), no como excluida.
 */
export function excluidaAMano(destino: DestinoDeContexto, v: VinculoDelPanel): boolean {
  if (destino === "cronograma" || esSoloElegidas(destino)) return false;
  return v.included && afinado(destino, v) === false;
}

/**
 * Nexus la sugirió para ESTE documento y una persona la desestimó (`false`, sin candado). Solo en los
 * seis documentos: las sugerencias calculadas no la vuelven a ofrecer. No entra al documento.
 */
export function desestimadaPorElCse(destino: DestinoDeContexto, v: VinculoDelPanel): boolean {
  return esSoloElegidas(destino) && v.included && afinado(destino, v) === false;
}

/** La agregó (o en el cronograma y los documentos, la eligió) un humano para ESTE documento. */
export function forzadaAMano(destino: DestinoDeContexto, v: VinculoDelPanel): boolean {
  return afinado(destino, v) === true;
}

/** Por qué alimenta, en palabras: la fila del panel lo muestra. */
export function origenDelVinculo(destino: DestinoDeContexto, v: VinculoDelPanel): string {
  // En el cronograma y los seis documentos solo alimenta la elegida, así que el porqué es siempre el mismo.
  if (destino === "cronograma") return "elegida para el cronograma";
  if (esSoloElegidas(destino)) return `elegida para ${documentoDelDestino(destino)?.elDocumento ?? "este documento"}`;
  if (destino === "exploracion") return forzadaAMano(destino, v) ? "agregada a mano" : "sugerida: reunión con el cliente";
  if (forzadaAMano(destino, v)) return "forzada a mano";
  return v.isPrimary ? "primaria" : "confianza alta";
}

/** ¿El destino usa la regla de relevancia por título (y el chip «aplica» del buscador)? */
export function usaReglaDeRelevancia(destino: DestinoDeContexto): boolean {
  return destino === "handoff";
}

/** ¿El destino sugiere solo, por «reunión con el cliente»? Desde la etapa 7, solo la exploración. */
export function sugiereConElCliente(destino: DestinoDeContexto): boolean {
  return destino === "exploracion";
}

/**
 * QUÉ ESCRIBE la puerta de un documento en su columna (POST .../contexto/[pieza]/sessions). Puro.
 *
 * En los seis documentos (los tres valores de la etapa 7):
 *   · «Usar» o «Agregar» (`feeds: true`) → `true`: la eligió una persona (también al deshacer una X:
 *     devolver es elegir).
 *   · la X sobre una elegida (`feeds: false`) → `null`: deja de elegirla, como en el cronograma.
 *   · «Descartar» una sugerencia (`feeds: false, desestimar: true`) → `false`: desestimada, sin candado.
 * En la exploración (la regla sugerida de antes): la X → `false`; deshacer la X de una sugerida → `null`
 * (vuelve a «sugerida»); agregar → `true`.
 */
export function valorDelAfinado(
  destino: DestinoDeDocumento,
  p: { feeds: boolean; desestimar: boolean; sugerida: boolean },
): boolean | null {
  if (esSoloElegidas(destino)) {
    if (p.feeds) return true;
    return p.desestimar ? false : null;
  }
  if (!p.feeds) return false;
  return p.sugerida ? null : true;
}
