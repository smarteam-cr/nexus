/**
 * lib/agents/retirados.ts — LOS AGENTES QUE YA NO SE DESPACHAN, AUNQUE SU FILA SIGA ACTIVA.
 *
 * Puro. Lo leen /analyze (que los saca de los candidatos: caen en el 409 «no configurado») y el gate
 * de artefactos (que los sigue gateando, como defensa en profundidad).
 *
 * `agent-timeline-assist` era «Pedir cambio con IA» del cronograma. Se retiró en E4 (2026-09): todo
 * cambio con IA del cronograma pasa por el chat. Su fila puede seguir ACTIVE (Elías la pasa a
 * Borrador en /agents) y no tiene paso asociado, así que /analyze la alcanzaba por dos puertas: por
 * id y por el respaldo `associatedStep === null` de un pedido sin id.
 *
 * `agent-mapeo-inicial` era el mapeo de procesos viejo (un mapa del «proceso actual» por proceso,
 * leyendo las notas de Gemini cortadas). Se retiró el 2026-10-05: los procesos los arma
 * lib/procesos/agente.ts (hoy y después, en carriles, con citas verificadas), que no pasa por /analyze.
 */

/** Agentes cuya fila puede seguir ACTIVE en la tabla `Agent` pero que ya no se despachan. ⛔ Sacar un id de acá
 *  sin pausar su fila lo vuelve despachable desde /analyze (por id, o por su respaldo `associatedStep === null`). */
export const AGENTES_RETIRADOS: readonly string[] = ["agent-timeline-assist", "agent-mapeo-inicial"];
export const esAgenteRetirado = (id: string): boolean => AGENTES_RETIRADOS.includes(id);
