/**
 * lib/lifecycle — exports públicos del módulo (aislamiento ARCHITECTURE §5).
 * Otros módulos/páginas importan de acá, nunca de archivos internos.
 *
 * Fuente de verdad del CICLO DE VIDA del proyecto (etapas + gates de salida).
 * Cobranza (v1 solo lectura) y cualquier otro módulo consumen
 * `getProjectLifecycle` / `loadLifecycleBatch` + `STAGE_LABEL_ES`.
 *
 * Excepción sancionada: módulos PUROS (p.ej. lib/portfolio/summary.ts) importan
 * `./stage-engine` DIRECTO — este index re-exporta el loader (Prisma) y arrastraría
 * runtime de DB a módulos que deben quedar unit-testeables.
 */
export {
  inferLifecycleStage,
  resolveLifecycleStage,
  resolveLifecycleCycle,
  suggestAdoptionMode,
  stageAtOrAfter,
  stagePosition,
  FULL_CYCLE_ORDER,
  SHORT_CYCLE_ORDER,
  STAGE_LABEL_ES,
  HUBSPOT_STAGE_VALUE,
  type LifecycleSignals,
  type InferredStage,
  type LifecycleCycle,
  type AdoptionMode,
} from "./stage-engine";
export { loadLifecycleBatch, getProjectLifecycle, type ProjectLifecycle } from "./load";
