/**
 * lib/business-cases — módulo de Ventas (Business Case Generator).
 * Punto de entrada público: el resto de la app importa solo desde acá.
 */
export * from "./schema";
export * from "./queries";
export * from "./mutations";
export { generateBlocks } from "./agent";
