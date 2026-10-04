/**
 * lib/finanzas/cierre-esquemas.ts — lo que aceptan las rutas del cierre del mes (rediseño de Finanzas, 2026-10-03).
 */
import { z } from "zod";

const periodo = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "El mes no es válido.");

export const accionDeCierreSchema = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("CERRAR"), periodo }),
  z.object({
    accion: z.literal("REABRIR"),
    periodo,
    motivo: z.string().trim().min(3, "Di por qué se reabre: queda escrito.").max(1000),
  }),
]);

export const tipoCambioSchema = z.object({
  periodo,
  /** Sin número: confirmar el que está. Con número: poner otro, con de dónde sale. */
  crcPorUsd: z.number().positive().max(100_000).optional(),
  fuente: z.string().trim().max(300).optional(),
}).refine((d) => d.crcPorUsd === undefined || (d.fuente && d.fuente.length >= 3), {
  message: "Di de dónde sale el tipo de cambio (por ejemplo, «BCCR venta, promedio del mes»).",
});
