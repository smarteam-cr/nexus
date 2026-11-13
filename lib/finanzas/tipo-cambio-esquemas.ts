/**
 * lib/finanzas/tipo-cambio-esquemas.ts — el esquema de la frontera de los topes del aviso de tipo de cambio (2026-11-13).
 * Aparte de tipo-cambio-planilla.ts, que lo lee una pantalla de cliente: zod no va al navegador (client-safe.test.ts, C-24).
 */
import { z } from "zod";

/** El cuerpo de «Guardar» los topes (PUT /api/finanzas/tipo-de-cambio/umbrales). Lo de fondo lo dice `errorDeUmbrales`. */
export const umbralesSchema = z.object({ vigilarPct: z.number(), decidirPct: z.number() }).strict();
