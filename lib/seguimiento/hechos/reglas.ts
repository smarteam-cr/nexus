/**
 * lib/seguimiento/hechos/reglas.ts — las reglas de ENCENDIDO de la lectura de hechos (memoria de la cuenta, etapa 6).
 * PURO: lo usan el servidor (lib/seguimiento/hechos-server.ts), la cola de la lectura (lib/lecturas) y las pruebas.
 *
 * La lectura de hechos se despliega APAGADA: la variante y el modelo los decide el sondeo de la etapa 5
 * (scripts/sondeo-de-hechos.ts), que todavía no corrió. Sin la variable `SEGUIMIENTO_HECHOS`, o con cualquier valor que
 * no sea «1», nada de la etapa 6 corre: ni la llamada de hechos, ni el enrutador, ni la cobertura de las reuniones con
 * solo notas. La lectura de cada reunión (etapa 2) sigue igual que antes, con su avance, su ficha y su etapa de siempre.
 * Ver docs/DECISIONS.md «Hechos, enrutador y novedades» y docs/RUNBOOK.md.
 */

/** El slug de la corrida (`AgentRun.agentSlug`) y de la telemetría (`LlmCall.agentSlug`) de la lectura de hechos. */
export const AGENT_SLUG_DE_HECHOS = "seguimiento-hechos";

/** El SQL que crea la tabla (lo nombran los avisos cuando falta). */
export const SQL_DE_LOS_HECHOS = "scripts/sql/2026-10-10-hechos-de-reunion.sql";

/** La variable del `.env` que la prende. */
export const VARIABLE_DE_LOS_HECHOS = "SEGUIMIENTO_HECHOS";

/**
 * ¿Está prendida la lectura de hechos? Solo con `SEGUIMIENTO_HECHOS=1`: cualquier otro valor (vacía, «true», «si»)
 * la deja apagada, como dice el RUNBOOK. Es lo contrario de la lectura de seguimiento (`seguimientoPrendido`, prendida
 * por defecto), a propósito, porque la variante y el modelo todavía no se decidieron.
 */
export function hechosPrendidos(env: Readonly<Record<string, string | undefined>>): boolean {
  return (env[VARIABLE_DE_LOS_HECHOS] ?? "").trim() === "1";
}

/** Cuántas veces se intenta leer los hechos de una reunión para un mismo dueño antes de dejarla. */
export const MAX_INTENTOS_DE_HECHOS = 3;

/** Una corrida de hechos con más de 15 minutos en RUNNING se cayó a mitad: no frena otro intento. */
export const MINUTOS_CORRIDA_COLGADA = 15;

/** Cuántas reuniones reintenta el job en cada tick (después de sus lecturas, contra el presupuesto automático). */
export const REINTENTOS_DE_HECHOS_POR_TICK = 2;

/**
 * Las reuniones con SOLO notas de Gemini se leen (cobertura de la etapa 6) si sus notas tienen al menos esto. El mismo
 * piso que el texto de la reunión (lib/seguimiento/hechos/texto.ts › `MIN_CARACTERES_PARA_LEER`).
 */
export const MIN_NOTAS_PARA_LEER = 400;

/** La nota con que se retiran los hechos vivos de una reunión que cambió de dueño. */
export const NOTA_CAMBIO_DE_DUENO = "La reunión cambió de dueño";

/** Quién firma lo que decide Nexus solo (el cambio de dueño). */
export const DECIDE_EL_SISTEMA = "sistema";
