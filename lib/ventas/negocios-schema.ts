/**
 * lib/ventas/negocios-schema.ts — lo que acepta la API de los negocios abiertos (2026-10-14). CLIENT-SAFE.
 */
import { z } from "zod";

/** La respuesta a «¿cuándo cierra y cuánto vale?»: lo que se escribe en el negocio de HubSpot. Al menos uno. */
export const RespuestaDelNegocioSchema = z
  .object({
    fechaCierre: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha va como AAAA-MM-DD.")
      .optional(),
    monto: z.number().finite().positive("El monto tiene que ser mayor que cero.").max(100_000_000).optional(),
  })
  .strict()
  .refine((r) => r.fechaCierre !== undefined || r.monto !== undefined, "Falta la fecha de cierre o el monto.");

export type RespuestaDelNegocio = z.infer<typeof RespuestaDelNegocioSchema>;
