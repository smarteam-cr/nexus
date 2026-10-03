/**
 * lib/timeline/arranque.ts — ¿esta fase es el ARRANQUE del proyecto (la Semana 0 o el kick-off)?
 *
 * Vive solo para que la regla tenga UNA fuente y se pueda importar desde la pantalla:
 * lib/timeline/semana-cero.ts la reexporta, pero arrastra los prompts de los agentes por tipo
 * (lib/agents/handoff-por-tipo.ts) y no puede viajar al navegador. Los límites del cronograma
 * (lib/timeline/limites.ts) la usan para contar lo vendido SIN la Semana 0.
 */
export const PRIMERA_FASE_ES_ARRANQUE = /semana\s*0|semana\s*cero|kick.?off|arranque/i;
