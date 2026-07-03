/**
 * lib/marketing/index.ts — exports públicos del módulo (ARCHITECTURE §5).
 * Otros módulos/páginas (ej. /icp) importan de acá, nunca de archivos internos.
 */
export { getIcpItemsGrouped, getSettings } from "./queries";
export { ICP_SEED, ICP_SECTION_META, ICP_SECTION_ORDER, MARKETING_AGENT_ID } from "./seed-data";
