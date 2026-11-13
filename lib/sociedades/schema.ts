/**
 * lib/sociedades/schema.ts — lo que aceptan las rutas de las sociedades de Smarteam (2026-11-13).
 */
import { z } from "zod";

const id = z.string().trim().min(1).max(64);
const periodo = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "El mes no es válido.");

export const sociedadDeLaCuentaSchema = z.object({ sociedadId: id.nullable() });

export const anotarMovimientoSchema = z
  .object({
    acreedoraId: id,
    deudoraId: id,
    fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha no es válida."),
    monto: z.number().positive("El monto tiene que ser mayor que cero.").max(100_000_000),
    moneda: z.enum(["CRC", "USD"]),
    concepto: z.string().trim().min(3, "Di de qué es: queda escrito.").max(300),
    factura: z.string().trim().max(60).nullable().optional(),
  })
  .refine((d) => d.acreedoraId !== d.deudoraId, { message: "Una sociedad no se debe a sí misma." });

export const cambiarMovimientoSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("ACEPTAR"), nota: z.string().trim().min(3, "Di por qué está bien así: queda escrito.").max(1000) }),
  z.object({ tipo: z.literal("QUITAR_ACEPTACION") }),
  z.object({ tipo: z.literal("ANULAR") }),
]);

export const marcaDeAjustesSchema = z.object({
  periodo,
  pendientes: z.boolean(),
  nota: z.string().trim().max(1000).nullable().optional(),
});
